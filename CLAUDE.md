# CLAUDE.md

## This file is frozen (Eric, 2026-09-14)

IMPORTANT: do not edit `CLAUDE.md` — not a line, not a number, not a "sync" — unless Eric explicitly instructs it in the current conversation. A `PreToolUse` hook (`.claude/settings.json` → `.claude/hooks/protect-claude-md.sh`) denies every direct edit — Edit/Write on a `CLAUDE.md`, and any Bash command that names one as a write target. It is a tripwire, not a wall: do not look for a way around it. Only Eric lifts it: launch with `HC_UNLOCK_CLAUDE_MD=1`, or remove the hook. New agent rules go in `_bmad-output/project-context.md` or auto-memory; rulings go in `epic-N-context-amendments.md`. If a line here is stale, say so in your report; do not fix it here.

## Project

Hullcracker.io — a real-time, gridless naval battle royale in the browser: one ship per player on a circular ocean with islands, an authoritative 20 Hz server sim with client-side prediction, two-tier fog of war (true-sight bubble + rotating radar sweep with height-aware terrain shadows), a boon-card economy and a shrinking storm. Last hull floating wins. This IS `main`; the old turn-based hex game survives only in git history and `CHANGELOG.md`. Player-facing overview: `README.md`.

Stack: TypeScript monorepo (npm workspaces) — `shared` (pure sim) → `server` (Colyseus) and `client` (PixiJS 8 + Vite). Node 22. Vitest per workspace; ESLint with `complexity: ["error", 10]`.

## Commands

```
npm run dev          # Colyseus server (:2567) + Vite client (:5173) — never in Eric's checkout (he manages that one); in your own worktree you may, and must kill it after
npm run check        # lint + type-check (shared/server/client) + all tests + hook test — the gate before any PR
npm run lint         # ESLint (complexity ≤ 10 is an ERROR: fix it immediately, whatever its origin)
npm test -w shared   # likewise -w server / -w client; run the workspace you touched first
npm run build        # order matters: shared → client → server
```

- The server must boot from `server/` (or `--tsconfig server/tsconfig.json`): Colyseus schema decorators need that tsconfig.
- Headless smokes in `server/scripts/*.mjs` use dev-only room options honoured only with `HC_DEV_OPTIONS=1`.
- Fresh worktree: `npm install --include=dev && npm run build -w shared` before trusting any gate run.
- Ports: game server `:2567` (override with `PORT`), Vite client `:5173`. Before any browser-based testing, check `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173`; if it isn't up and you are in Eric's checkout, ask him to start it and wait. Never touch a server you didn't start. If you find stale node processes on `:2567` or `:5173`, kill them and tell Eric. A Vite dev build is never the basis for a performance verdict.

## Architecture invariants (the rules that make a locally-plausible change globally wrong)

- **Strict layering.** `shared/src` is deterministic pure functions over plain objects, zero I/O, imported by both sides. Both sides run the SAME sim functions at the same 50 ms dt; that is what makes prediction match the server. Never fork sim logic per side.
- **`CONFIG` (`shared/src/constants.ts`) is the single source of truth** for every gameplay tunable; client-only feel knobs live in `client/src/config.ts`. Promote a value to `CONFIG` the moment it becomes gameplay-load-bearing.
- **`effectiveStats()` (`shared/src/sim/stats.ts`) is the boon desync firewall.** (ship class + fitted boons) → every derived stat, one pure function both sides call; derived fields are re-pinned post-fold inside it. Never re-derive a boosted stat ad hoc.
- **`PROTOCOL_VERSION` (`shared/src/index.ts`) is bumped on ANY wire-contract change** — including boon-catalog content — and is a runtime join gate. A `CONFIG` block bumps it only when the client READS it.
- **Anti-cheat chokepoint.** Everything spatial leaving the server goes through `server/src/game/frames.ts`, whose contacts/events come exclusively from `perception.observe()` via the `signals.ts` registry. Property-style invariant tests enforce that nothing outside sight ∪ this-tick radar paints reaches a client, with exactly SIX declared exceptions (`sp`, `hc`, `mz`, `sunk`, `sm`, `fh`) plus the jamming-buoy fakes carve-out. Extend the invariants for any new event; never add a seventh exception without an Eric ruling.
- **`game/world.ts` and `game/match.ts` have zero Colyseus imports**; `ArenaRoom` is a thin adapter; the Colyseus schema syncs only the roster, the revealed zone rings, `matchPhase` and `bountyId` — nothing per-ship spatial, which travels in per-client frames. New systems get an explicit slot in the declared `STEP_ORDER`.
- **Player intent enters only through `game/inputs.ts`** (finite-checked, clamped, malformed silently dropped).
- **Map generation has zero transcendentals** (`sim/noise.ts`, `sim/heightField.ts`) so the field is byte-identical across JS engines; islands never travel on the wire.
- **Client one-way data flow:** net (server mirror) → sim (prediction) → render views. `state.ts` is a leaf; render modules never drive net/sim. Canvas is Pixi; DOM is only for chrome (home, settings, refit, results, kill feed, static pages).
- **Bots (`server/src/game/ai/`) may not import `world.js`** — ESLint enforces it; a bot's whole world is a bound `observe` thunk.
- ~500 LOC per file is a soft cap; exceed only when cohesive.

## Working rules

- **Eric is the requirement.** Never invent game mechanics, balance values, copy, or design decisions; ask him (interactively, via AskUserQuestion — never a questions file). Docs are downstream of him, and an AC/FR never overrides what he just said.
- **Halt on any error** and surface it; never work around it.
- **Branch from `development`, never `main`.** PRs target `development`; `main` deploys production. If anything lands on `main` directly, merge `main` back into `development` immediately.
- **Every landed PR updates both trackers** — `_bmad-output/gds-workflow-status.yaml` and `_bmad-output/implementation-artifacts/sprint-status.yaml` — with ONE-LINE stamps only (date, cycle, version, PV, amendment range, pointer). They are status trackers, not changelogs.
- **Versioning is frozen at `0.17.X`** until all epics complete; X = the landed build-cycle count, +1 per cycle (`VERSION` + root `package.json`, single-sourced into the client by Vite). This is an Eric ruling; do not resume semver.
- **Durable homes:** rulings and "what will bite the next agent" → `epic-N-context-amendments.md` (append-only); open threads → `deferred-work.md`; per-cycle record → `spec-*.md`. Never in the trackers, never here.
- Plans are one unit of work: commit and push the branch continuously, open ONE PR at the end. Use plain `git`/`gh` for branches, PRs and merges.
- Never launch batch sims unprompted; approved quick runs are capped at 99 matches.

## Where things live

- Codebase map (file-by-file, archived): `docs/codebase-map.md`. The code and `shared/src/index.ts` (the barrel) are canonical.
- Key decisions narrative (archived): `docs/key-decisions.md`. Canonical: `_bmad-output/implementation-artifacts/epic-N-context-amendments.md`.
- Deploy long-form: `docs/deploy.md`.
- Agent rules for BMAD runs: `_bmad-output/project-context.md`.
- Design source of truth: `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` (+ `EXPERIENCE.md`). Read it before any visual/UI decision; do not deviate without Eric. When reviewing UI code, flag anything that doesn't match it. Root `DESIGN.md`/`TODOS.md` were deleted at cycle 126 — there is exactly one `DESIGN.md`.
- Gameplay design: the GDD at `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md`.

## Skills

Project-local only: `/balance-sim`, `/orchestrate`, and the `bmad-*` / `gds-*` / `wds-*` suites under `.claude/skills/`. When a request matches one, invoke it first. gstack is NOT used on this project in any capacity (Eric, 2026-09-14) — do not route to its skills even if they are installed.

## Deploy

Render: two web services from one `render.yaml` (Blueprint autoSync ON against `main` — the file is live config; never change deploy settings in the Render dashboard or API). Long form, the staging password and the staging blind spots: `docs/deploy.md`.

- Production `hullcracker`: branch `main` → https://hullcracker.io/ (public; GA4 + AdSense live).
- Staging `hullcracker-dev`: branch `development` → https://hullcracker-dev.onrender.com/ (password-gated by `HC_STAGING_KEY`, `noindex`, no analytics/ads).
- Flow: branch from `development` → PR to `development` → Render auto-deploys staging → manual QA on staging is the gate → merge `development` into `main` (merge method: merge) → production auto-deploys.
- Health check: poll the URL of whichever environment deployed; never health-check production after a staging deploy. With `HC_STAGING_KEY` set, a healthy staging host answers `401` (the password gate), not `200`.
- Staging cannot catch performance (starter plan) or the analytics/ads code paths (their env vars are absent there); a change touching those needs a production smoke right after merge.
