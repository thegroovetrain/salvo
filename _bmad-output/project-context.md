---
project_name: 'Hullcracker.io'
user_name: 'Eric'
date: '2026-09-14'
sections_completed:
  [
    'technology_stack',
    'engine_architecture_rules',
    'anticheat_perception_rules',
    'performance_rules',
    'code_organization_rules',
    'testing_rules',
    'platform_build_rules',
    'critical_dont_miss_rules',
  ]
existing_patterns_found: 14
status: 'complete'
rule_count: 41
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing game code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Engine:** Custom browser engine — no Unity/Unreal/Godot. TypeScript monorepo (npm workspaces), Node v22.
- **Workspaces (strict layering):** `shared` (pure deterministic sim, zero deps) → `server` (Colyseus 0.17, @colyseus/schema 4.x, @colyseus/tools, Express 4) and `client` (PixiJS 8.19, @colyseus/sdk 0.17, Vite 6).
- **Language/tooling:** TypeScript ~5.7, ESLint 10 + typescript-eslint (complexity ≤ 10 enforced), Vitest (2.x shared/server, 4.x client + jsdom), tsx for server dev.
- **Version:** frozen at `0.17.X` until all epics complete; X = landed build cycles, +1 per cycle (Eric ruling 2026-08-01). `VERSION` + root `package.json`, single-sourced into the client by Vite.
- **Deploy:** Render, two environments from one `render.yaml` (a Blueprint with autoSync ON): `hullcracker` from `main` = production https://hullcracker.io/; `hullcracker-dev` from `development` = staging. Feature work branches from `development`, is QA'd on the staging host, and only then merges to `main`.

## Critical Implementation Rules

### Engine & Architecture Rules

- The "engine" is three strictly layered workspaces: `shared` (pure deterministic sim) → `server` (Colyseus 0.17) and `client` (PixiJS 8). `shared` imports from neither side, ever.
- Both sides run the SAME shared sim functions (`stepShip`, `stepShell`, `generateMap`, zone math) at the same fixed 50ms dt. Any behavior change to the simulation goes in `shared/` — never fork logic per side, or prediction desyncs.
- `effectiveStats()` (`shared/src/sim/stats.ts`) is the ONLY legal path from (ship class + upgrade counts) to any derived stat. Never re-derive an upgraded value ad hoc, on either side.
- `CONFIG` (`shared/src/constants.ts`) is the single source of truth for every gameplay tunable. Client-only feel knobs live in `CLIENT_CONFIG` (`client/src/config.ts`); promote a value to shared CONFIG the moment it becomes gameplay-load-bearing.
- `PROTOCOL_VERSION` (`shared/src/index.ts`, currently 49) must be bumped on ANY wire-contract break (`shared/src/types.ts`).
- Colyseus schema syncs the roster (`ArenaState`/`PlayerMeta`), the map seed/radius, the revealed zone rings, `matchPhase` and `bountyId` — nothing PER-SHIP spatial. All spatial state travels in per-client frames. Never add per-ship spatial fields to the schema.
- `game/world.ts` and `game/match.ts` keep ZERO Colyseus imports; `ArenaRoom` stays a thin adapter. This is what keeps the sim unit-testable.
- No `Math.random()` or `Date.now()` in sim code — all randomness is seeded `mulberry32` streams; the map rebuilds deterministically from `mapSeed` (islands never travel on the wire); `World` owns the single server clock.
- Client one-way data flow: net (server mirror) → sim (prediction) → render views. `state.ts` is a leaf; render modules never drive net/sim.
- Canvas is Pixi; DOM is ONLY for chrome (menu, results, kill feed, upgrade menu, toasts). Never build tactical UI in DOM.

### Anti-Cheat & Perception Rules

- Everything spatial leaving the server goes through `frames.ts`, and its contacts/events come EXCLUSIVELY from `perception.observe()`. No other code path may emit spatial data to a client.
- The invariant: nothing outside (sight bubble ∪ this-tick radar paints) may appear in any frame. Property-style tests enforce it — new event types must be added to those invariants.
- Per-event visibility rules: projectiles materialize at the sight boundary with current pos/velocity ONLY — never add range-derivable fields to wire events (the muzzle becomes solvable); a boom's victim id is stripped unless the victim's center is sighted; damage is victim-private; upgrade/point events are self-private.
- Player intent enters the sim ONLY through `game/inputs.ts` (every field finite-checked, axes clamped, malformed silently dropped). New input fields must be validated there.
- Boon offers are DRAWN at earn time from the player's own deck (`drawOffer`, `shared/src/sim/deck.ts`) and held server-side as a `BoonOffer` (`shared/src/sim/offers.ts`) — reopening the refit window must NEVER reroll.

### Performance Rules

- Server runs a fixed 20Hz (50ms) tick over the declared, order-pinned `STEP_ORDER` table in `game/world.ts`. New systems get an explicit, deliberate position in that table.
- Client: use object pooling (`client/src/util/pool.ts`) for per-frame ephemera; avoid fresh allocations inside render-loop code paths.
- Fog is a pre-baked texture composite; phosphor blip decay is client-side render math from timestamps — the server keeps NO blip history. Don't move these costs server-side.
- Contacts render ~100ms behind (snapshot interpolation); own ship predicts forward with a reconcile-and-replay ring. Don't "fix" perceived lag by shortening buffers without understanding both mechanisms (`P` toggles prediction for debugging).

### Code Organization Rules

- Cyclomatic complexity ≤ 10 is an ESLint ERROR — refactor, never suppress. Standing directive: if the linter ever surfaces complexity errors, fix them immediately regardless of origin.
- ~500 LOC per file is a soft cap; exceed only when content is cohesive.
- `shared/src/index.ts` is the single barrel export for shared.
- New equipment implements the one `Equipment` interface (`server/src/game/equipment/`), a TOTAL registry keyed by `EquipmentId` in its `index.ts`; every fitted system's reload ticks every tick regardless of selection. `game/combat.ts` is a compatibility re-export — new code imports from `equipment/guns.ts`.
- File naming is lowerCamelCase (`roomOptions.ts`, `killFeed.ts`, `upgradeMenu.ts`).

### Testing Rules

- `npm run check` (lint + tsc for all three workspaces + all tests, the count changes every cycle) is the gate — it must pass before any ship. It now also runs `check:hooks` (the CLAUDE.md protection hook's own test suite).
- Perception invariant tests are property-style; any change touching `perception.ts`/`frames.ts` must keep them green and extend them for new events.
- The PvE fleet envelope table and the three beta classes are pinned by an identity test (`shared/src/__tests__/shipClasses.test.ts`); the fleet table is NOT the retired prototype kinematics byte-for-byte (deliberately re-pinned at Story 5.6) — any change to either table must update that test knowingly.
- Headless smokes (`server/scripts/*.mjs`) prove full flows over real sockets and require `HC_DEV_OPTIONS=1`.
- Vitest versions differ: shared/server on 2.x, client on 4.x + jsdom — don't assume API parity across workspaces.

### Platform & Build Rules

- Browser-only target. Build order matters: shared → client → server (`npm run build`).
- The server must boot from `server/` (or with `--tsconfig server/tsconfig.json`) — Colyseus schema decorators need that tsconfig.
- Dev-only room options (`matchOverride`/`zoneOverride`) are honored only under `HC_DEV_OPTIONS=1`; production behavior must never depend on them, and `sanitizeRoomOptions()` gates everything client-supplied.
- Versioning: frozen at `0.17.X` until all epics complete; X = landed build cycles, +1 per cycle (Eric ruling 2026-08-01). `VERSION` + root `package.json`, single-sourced into the client by Vite at build time.
- Deploy is Render auto-deploy on push to a service's own branch: `main` -> production (https://hullcracker.io/), `development` -> the staging host. BRANCH FROM `development`, NOT `main` — merging to `main` deploys the public game, and the staging QA pass is the gate in front of it. `render.yaml` is the live Blueprint source for BOTH services: make config changes there, never in the Render dashboard or API. Ports: game server `:2567`, Vite `:5173`. NEVER start the dev server — the user manages it; curl-check `:5173` before any browser-based work.

### Critical Don't-Miss Rules

- Never invent game mechanics, balance values, or design decisions without consulting Eric — design questions go to the GDD, not improvisation.
- **Deleted docs:** root `TODOS.md` and root `DESIGN.md` were deleted at cycle 126 (Eric ruling 2026-08-21) — both were hex-era and the latter shared a filename with the real design source of truth, which is how a reader ends up in the wrong document. Git history preserves them, and an archival copy of the v0.16 root design doc lives at `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/imports/DESIGN-v0.16-root.md`. Design source of truth: `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` (+ `EXPERIENCE.md`); gameplay design: the GDD in `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/`.
- Every completed gds-* phase updates `_bmad-output/gds-workflow-status.yaml` in the same PR as its artifacts.
- Torpedoes spawn with real bow clearance + owner-only grace and must outrun every hull — speed changes must preserve "can't self-hit at base speed".
- The win check counts afloat PARTICIPANTS (`role !== 'fleet'` — humans AND combat bots contest it; only PvE fleet hulls are excluded), and a sinking hull holds the transition open. Fleet hulls and bots are ordinary ships driven through the same input pipeline — never special-case their physics or visibility.
- Use the shared math primitives (`wrapPositive` for angles, `segCircleHit` for LOS) — don't hand-roll geometry that already exists.
- Plans are one unit of work — never split into multiple PRs without explicit advance approval; halt on ANY error and surface it rather than working around it.
- **`CLAUDE.md` is FROZEN and hook-enforced** (Eric, 2026-09-14): a `PreToolUse` hook (`.claude/hooks/protect-claude-md.sh`) denies every edit; only Eric lifts it. New agent rules go HERE or to auto-memory; rulings to `epic-N-context-amendments.md`. Long-form context that used to live there is archived (not auto-loaded) in `docs/codebase-map.md`, `docs/key-decisions.md`, `docs/deploy.md`.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any game code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when the technology stack or architecture invariants change
- Review periodically for outdated rules; remove rules that become obvious over time

Last Updated: 2026-09-14
