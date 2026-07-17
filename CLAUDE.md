# CLAUDE.md

## Project

Hullcracker is a real-time, gridless naval battle royale in the browser (RT prototype). One ship per player on a large circular ocean with islands. Everyone fights on the same water in real time: an authoritative 20Hz server simulation with client-side prediction. Two-tier fog of war (a true-sight bubble around your hull plus a rotating radar sweep that paints decaying phosphor blips), guns/torpedoes/mines with real firing arcs, kill-banked upgrade points, and a shrinking storm circle. Last hull floating wins. This branch replaced the previous turn-based hex game (which still lives on `main`); see README.md for the player-facing overview.

Stack: TypeScript monorepo (npm workspaces) — `shared` (pure sim), `server` (Colyseus 0.16), `client` (PixiJS 8 + Vite).

### Commands
```
npm run dev          # Colyseus server (:2567) + Vite client (:5173) via concurrently
npm run check        # lint + type-check (shared/server/client) + all tests (649)
npm run lint         # ESLint (complexity=10 enforced)
npm test -w shared   # Shared sim tests (kinematics, geometry, ballistics, zone, mapgen, stats, offers)
npm test -w server   # Server tests (world sim, perception/anti-cheat invariants, match state machine, drones)
npm test -w client   # Client tests (prediction, snapshots, clock, HUD/feel pure logic)
npm run build        # Build order: shared → client → server
```

- The server game process listens on `:2567` (override with `PORT`); the Vite client dev server is `:5173`. Open the client URL in the browser.
- **Server must boot from `server/`** (or `--tsconfig server/tsconfig.json`): Colyseus schema decorators need that tsconfig.
- **Headless smokes** in `server/scripts/*.mjs` prove full flows over real sockets. They use dev-only room options the server only honors when `HC_DEV_OPTIONS=1` is set — production clients can never pass them.

### Architecture

Three workspaces with strict layering: `shared` (deterministic pure simulation, imported by both sides) → `server` (authoritative world + Colyseus room) and `client` (prediction + Pixi renderer). Both sides run the SAME shared sim functions, which is what makes client-side prediction match the server.

#### Shared (`shared/src/`) — deterministic sim, zero I/O, plain objects
- **index.ts** — single barrel re-export; declares `PROTOCOL_VERSION` (bumped on any wire-contract break).
- **constants.ts** — `CONFIG`: the single source of truth for every simulation tunable (map, three ship classes, vision/radar/sweep, gun/torpedo/mine, storm zone timeline, upgrade stacking). Also `UPGRADE_IDS`, `UPGRADE_CATEGORIES`, `HEAL_CHOICE`.
- **types.ts** — the client/server wire contract: `InputMsg`, per-client frames, `OwnShip`, contacts, blips, game events, `MSG` channel names, `WelcomeMsg`/`ResultsMsg`, `WeaponId`.
- **math/** — vec.ts, angle.ts (`wrapPositive`), geom.ts (`segCircleHit` — the LOS primitive), rng.ts (`mulberry32` seeded RNG).
- **sim/ship.ts** — ship kinematics (`stepShip`, `ShipConfig`, hull endpoints).
- **sim/stats.ts** — `effectiveStats()`: THE server/client desync firewall. One pure function turns (ship class + upgrade counts) into every derived number the sim and HUD consume. Both sides MUST call it; nothing re-derives an upgraded stat ad hoc.
- **sim/offers.ts** — `rollOffer()`: pre-rolled upgrade offers (3 upgrades from 3 distinct categories), deterministic per RNG stream so an offer rolled at earn-time can never reroll.
- **sim/collision.ts** — boundary + ship-island resolution.
- **sim/shell.ts** — swept ballistic collision (`stepShell`).
- **sim/map.ts** — seeded deterministic map generation (`generateMap`); islands never travel on the wire, both sides rebuild from the seed.
- **sim/zone.ts** — storm circle timeline (`zoneRadiusAt`/`zonePhaseAt`/`isOutside`).

#### Server (`server/src/`)
- **index.ts** — `@colyseus/tools` boot; listens on `PORT` or `:2567`.
- **app.config.ts** — Colyseus app config; registers the `arena` room.
- **rooms/ArenaRoom.ts** — thin Colyseus adapter around `World` + `Match`. Bridges joins/leaves → roster schema, raw `"i"` input messages → World's input store, fixed steps → per-client frames. Gates dev room options behind `HC_DEV_OPTIONS`.
- **rooms/roomOptions.ts** — `sanitizeRoomOptions()`: security gate for client-supplied room options.
- **rooms/schema/ArenaState.ts** — Colyseus `@type` schema (roster / `PlayerMeta`); only the roster syncs via schema — all spatial state flows through frames instead.
- **game/world.ts** — the authoritative simulation. Plain TS, ZERO Colyseus imports (fully unit-testable). Owns the single server clock; runs a 20Hz (50ms) fixed tick with a defined step order (inputs → ships → boundary → islands → shells → fire control → radar paint → sweep advance → respawns).
- **game/perception.ts** — per-observer visibility: the fog-of-war core and anti-cheat boundary (`observe()`). Two vision tiers (sight bubble + radar sweep), island LOS, and per-event visibility rules. Property-style invariant tests enforce that nothing outside sight ∪ this-tick radar paints can appear in any frame.
- **game/frames.ts** — per-client frame construction; the single chokepoint for everything spatial leaving the server (the `toClientView()` philosophy carried forward). Contacts/events come EXCLUSIVELY from `perception.observe()`.
- **game/inputs.ts** — input validation + latest-input store; the only path player intent enters the sim. Malformed messages are silently dropped (every field finite-checked, axes clamped).
- **game/match.ts** — match lifecycle state machine (waiting/countdown/live/results). Pure logic, zero Colyseus imports; the room implements its side-effect hooks.
- **game/drones.ts** — weaponless target drones that fill empty slots so a solo human still gets a battle royale. A drone is an ordinary ship driven through the same input pipeline; win checks are human-gated.
- **game/spawn.ts** — spawn-ring placement (max-min distance from existing ships, island-clear).
- **game/combat.ts** — compatibility re-export of gun fire control (moved into weapons/guns.ts).
- **game/weapons/** — `WeaponSystem` interface + registry (index.ts): guns.ts, torpedoes.ts, mines.ts, shared ballistics.ts, ammo.ts. Selection is `input.weapon` (0 gun / 1 torpedo / 2 mine); every system's reload ticks every tick regardless of selection.

#### Client (`client/src/`)
- **main.ts** — bootstrap: build the Pixi stage, show the pre-join MENU (DOM) over the canvas, connect only on PLAY, then run the input→predict→render loop and the match-lifecycle UX (waiting/countdown → death → spectate → results → return to port).
- **state.ts** — mutable client game state; one-way data flow (server mirror → sim state → render views). Leaf-ish: no heavy app imports.
- **config.ts** — `CLIENT_CONFIG`: client-only render/feel tunables that never travel on the wire (gameplay-authoritative values stay in shared `CONFIG`).
- **app/loop.ts** — fixed-step sim + render loop driver.
- **net/** — connection.ts (`joinOrCreate('arena')`, welcome handshake, deterministic map rebuild from `welcome.mapSeed`), clock.ts (server clock estimate), snapshots.ts (snapshot buffer + contact interpolation), roomBindings.ts (message wiring).
- **sim/** — prediction.ts (own-ship prediction + reconcile-and-replay via the shared `stepShip` at the same 50ms dt), inputSampler.ts.
- **input/** — keyboard.ts (driving + upgrade actions), mouse.ts (aim within weapon arc + click-to-fire), telegraph.ts (9-detent set-and-forget engine orders).
- **render/** — PixiJS renderers: stage, camera, map, ships, contacts, projectiles, mines, fog (pre-baked texture composite), radar, phosphor (blip decay), zone, hud, firing, weaponArc, effects, shake, deniedFire, spectate, textures, fade.
- **ui/** — DOM overlays (canvas is Pixi; DOM only for chrome): menu, phase, results, killFeed, upgradeMenu (CTRL spend window), upgradeToast.
- **audio/** — context.ts + tones.ts (WebAudio tone system, mute-aware).
- **util/** — banner, math, pool (object pooling).

### Code Quality Conventions
- **Cyclomatic complexity ≤ 10** — Enforced by ESLint (`complexity: ["error", 10]`). All functions must stay under this limit.
- **~500 LOC per file** — Soft convention, not enforced. Files may exceed this when the content is cohesive.
- **One-way client data flow** — server mirror (net) → sim state (prediction) → render views. state.ts is a leaf (no heavy app imports); render modules never drive net/sim.
- **Sim purity** — `shared/` is pure functions over plain objects (zero I/O); `server/src/game/world.ts` and `game/match.ts` have zero Colyseus imports so they stay unit-testable.

### Key Decisions
- **CONFIG is the single source of truth** — every gameplay-authoritative tunable lives in `shared/src/constants.ts` (`CONFIG`). Client-only feel knobs live in `client/src/config.ts`; promote a value to shared CONFIG the moment it becomes gameplay-load-bearing.
- **Deterministic shared simulation** — the same pure functions (`stepShip`, `stepShell`, `generateMap`, zone math) run on server and client. This is what makes client-side prediction agree with the authoritative world. `PROTOCOL_VERSION` (shared/src/index.ts) gates wire-breaking changes.
- **effectiveStats() is the upgrade desync firewall** — (ship class + upgrade counts) → every derived stat, via one pure function both sides call. Server caches it on grant/spawn; client recomputes from `you.cls` + `you.upg`. Nothing may re-derive an upgraded stat ad hoc.
- **Upgrade offers are pre-rolled at earn-time** — a banked point carries a fixed offer of 3 upgrades from 3 distinct categories (`rollOffer`), rolled on the server's decorrelated upgrade stream and queued. Reopening the spend window can never reroll. Spend picks one upgrade (CTRL+1/2/3) or heals (CTRL+E, `HEAL_CHOICE`).
- **Authoritative 20Hz World, zero Colyseus imports** — `game/world.ts` owns the one server clock and runs a fixed 50ms step; `ArenaRoom` is a thin adapter. The room's only synced schema is the roster.
- **frames.ts is the single spatial chokepoint (anti-cheat)** — everything spatial leaving the server goes through per-client frame construction, and its contacts/events come EXCLUSIVELY from `perception.observe()`. Property-style invariant tests enforce that no contact/event references anything outside sight ∪ this-tick radar paints. Clients are never sent what their sight or sweep hasn't legitimately revealed.
- **Two vision tiers + one LOS rule** — true-sight bubble (`dist ≤ sightRange`, LOS-clear → live contacts) and radar (sight < dist ≤ radar, LOS-clear, beam crossed the bearing this tick → `blip` events). LOS = the observer→point segment crosses no island circle. Only ships paint on radar; phosphor decay is client render math (server keeps no blip history).
- **Per-event visibility rules** — shells/torps materialize at the sight boundary with current pos/velocity only (no range-derivable fields, so the wire can't be solved back to the muzzle); a boom's victim id is stripped unless the victim's center is sighted; damage is victim-private; upgrade/point events are self-private (enemy builds and point banks never ride on contacts).
- **Client prediction + reconciliation** — own ship is stepped locally each 50ms tick with a ring of un-acked inputs; every server frame drops acked inputs and replays the rest. Contacts are snapshot-interpolated (~-100ms). `P` toggles prediction ⇄ raw interpolation for debugging.
- **Fog is a pre-baked texture composite** — dark overlay with a feathered sight hole, conic sweep wedge, timestamp-decayed blips. DOM is used only for menu / results / kill feed; everything tactical is Pixi.
- **Match lifecycle is a pure state machine** — `game/match.ts` (waiting/countdown/live/results), zero Colyseus imports. Countdown arms at 2 human captains; a solo captain drives a weapons-safe ready room. Drones fill empty slots through the same input pipeline; the win check is human-gated.
- **Three ship classes, universal weapon fit** — Destroyer (fast/light), Cruiser (balanced), Battleship (slow/heavy). Only hull dims, hp, and kinematics vary; every class shares CONFIG.gun/torpedo/mine. Cruiser is byte-for-byte the pre-classes single ship, pinned by a balance-identity test.
- **One WeaponSystem interface** — guns/torpedoes/mines all implement it (`game/weapons/`); each weapon has its own ammo pool + reload timer (reload ticks regardless of which weapon is selected). Torpedoes spawn with real bow clearance + an owner-only grace and outrun every hull so they can't self-hit at base speed.
- **Storm circle** — a shared, damage-only zone timeline (`sim/zone.ts`) shrinks the ocean; stay inside or take damage.
- **Dev-only room options gated by `HC_DEV_OPTIONS=1`** — `matchOverride`/`zoneOverride` arrive verbatim from client join options and are only honored when the server process opts in (smokes/tests). Production clients cannot pass them.
- **Versioning: X.0.0 = major, 0.X.0 = minor, 0.0.X = revision** (`VERSION` + package.json, single-sourced into the client at build time by Vite).

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
- Before running `/qa`, `/browse`, or any browser-based skill, check if the client is running: `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173 2>/dev/null` (the game server is on `:2567`).
- If it's not running, ask the user to start it with `npm run dev` and wait.
- If you find stale node processes on port 2567 or 5173, kill them and tell the user.

## Design System
The design source of truth is `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` (with `EXPERIENCE.md` alongside as its peer interaction contract). Always read it before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match that DESIGN.md.

**Deprecated docs:** root `DESIGN.md` and root `TODOS.md` are superseded and must not be treated as current. Gameplay design questions go to the GDD (`_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md`).

## Deploy Configuration (configured by /setup-deploy)
- Platform: Render
- Production URL: https://hullcracker.io/
- Deploy workflow: auto-deploy on push to main
- Deploy status command: HTTP health check
- Merge method: merge
- Project type: web app (multiplayer game)
- Post-deploy health check: https://hullcracker.io/

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: automatic on push to main (Render auto-deploy)
- Deploy status: poll production URL
- Health check: https://hullcracker.io/

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