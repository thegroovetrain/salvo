---
title: 'Story 12.4 Airdrops and Supply Drops — XP crates, the level stat roll, wreck stat picks, charted supply drops replace radio beacons'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_revision: '49a4b654'
final_revision: 'PR #368'
cycle: '244'
version: '0.20.2'
protocol_version: '111 -> 112'
amendments: 'epic-12 amendments 5, 6 (rulings), 8 (build)'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/12-4-airdrops-and-radio-beacons.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context-amendments.md'
  - '{project-root}/_bmad-output/project-context.md'
---

# Story 12.4 — cycle record

The story file (`12-4-airdrops-and-radio-beacons.md`) holds the ACs; epic-12 amendments 5 and 6 hold Eric's rulings, amendment 8 the build-time rulings and readings. This file records what was built and how it was verified.

## What was built

**Shared**
- XP crates: every airdrop is an XP crate worth +0.1 level (`CONFIG`); the kind-coded stat crate is gone.
- The level roll (`sim/levelRoll.ts`): `rollDie` over the faces [0, 0, 1, 1, 2, 3], `rollLevelStats` once per index stat (ARMOR, POWER, ENGINES, RELOAD, INTEL) per completed level, `rollWreckStats` for the wreck's +1 picks. The out-of-cards +1 (`offer.exhausted`) is retired.
- `sim/supplyDrops.ts` replaces `sim/beacons.ts`: the supply-drop schedule, spot and scatter pure functions. The beacon target kind and its perception masks are deleted.
- `PROTOCOL_VERSION` 111 -> 112.

**Server**
- `game/supplyDrops.ts` replaces `game/beacons.ts`: 7 / 5 / 3 drops per ring cycle, charted at the cycle start, 10 XP crates land `surfaceMs` (1:00) later within 500 u of the spot; same edge margin, captain keep-out and spacing as the beacons had. Public chart on the schema seat the beacon chart used.
- XP crate grant through `grantXp`; the level roll on its own isolated stream; wreck = +1 random stat per level the victim had, no wreck at level 0.
- Spot, scatter and roll streams are keyed by HMAC-SHA256 from the room's dispersion key (`dispersionKey.ts`, labels `supply-spot`, `supply-scatter`, `stat-roll`).
- The `world.ts` slot in `STEP_ORDER`; beacon code and tests deleted.

**Bots**
- `ai/supplyDrops.ts` replaces `ai/beacons.ts`: every bot with no target sails for the nearest charted, not-yet-landed drop inside its patrol disc and waits; after landing it collects every crate it has seen inside the circle (remembered until taken, seen gone, or released), nearest first. An unreachable spot is released and barred for the router's retry time. A target always outranks the drop. The per-personality beacon switch is gone.

**Client**
- The +XP crate (square with `+XP` linework, XP mint #7fffc4, glow; same mark at the 10 px chart icon) and the supply-drop mark B (dashed 500 u ring, 8 % fill, 10 px icon; fades 10 s after landing): `render/drops.ts`, `render/supplyDrops.ts`, `sim/supplyChart.ts`.
- The amber stat flash (`render/console/statFlash.ts`): risen stats only, 600 ms hold, 1,500 ms smoothstep back, first observation seeds, hover preview wins; driven through tint, no text re-raster.
- Landing cue (`audio/cueEdges.ts`); How-to-Play DRAFT sentence for Eric. Beacon views, render and tests deleted.

## Rulings

- Amendment 5: XP crate +0.1 level; die [0,0,1,1,2,3] per stat per level, cards left or not; out-of-cards +1 retired; wreck +1 random stat per victim level, none at level 0; beacons removed, spawns become supply drops of 10 crates.
- Amendment 6: looks approved on the bench: +XP crate, amber flash, supply-drop mark B with a green fill.
- Dev time (amendment 8): every bot seeks charted drops; a bot collects what it sees and remembers it; the level roll applies instantly, even mid-collision; the mark and crate are the XP gauge's mint `phosphorBright` #7fffc4; the 10 px chart icon stays as built (chart icon later).

## Verification

- `npm run check` green — final counts: shared 1459, server 2986, client 4443, hooks 266 (shared / server / client / hook test).
- Review gate: two Fable reviewers + Codex. Findings and fixes:
  - Supply crates could overlap crates of another spot (both models): a supply crate now never lands within 2 x the crate radius of any crate on the water.
  - Room streams recoverable from the public chart (Fable, reproduced in about 34 s): spot, scatter and roll streams keyed by HMAC from the room key; the story's pseudonym-material seeding is NOT used.
  - Sparse-slot crash on the mark: guarded.
  - Flash re-rasterized text: now via tint.
  - A landing cue played after the match was over: suppressed.
  - A bot could stall on an unreachable supply spot: it drops the spot and bars it for the retry time.
- Pre-PR: `tickCost.mjs` old vs new: seed 7, 16 hulls, 90 s: mean 4.11 -> 4.54 ms/tick, p95 6.52 -> 7.26, p99 8.26 -> 9.01, max 12.76 -> 13.87; playCheck PASS, glBudget PASS; matchSmoke + weaponsSmoke + soloSmoke OK (matchSmoke's first run failed on a pinned damage that the level roll now changes; fixed by the dev-only `matchOverride.statRoll: false`); `glBudget.mjs`, `playCheck.mjs`, `matchSmoke` + `weaponsSmoke` — results in the PR body.

## Files changed

About 127 files (+4.4k / -6.3k). Deleted: `shared/src/sim/beacons.ts`, `server/src/game/beacons.ts`, `server/src/game/ai/beacons.ts`, `client/src/render/beacons.ts`, `client/src/sim/beaconView.ts` and their tests. Added: `shared/src/sim/levelRoll.ts`, `shared/src/sim/supplyDrops.ts`, `server/src/game/supplyDrops.ts`, `server/src/game/ai/supplyDrops.ts`, `client/src/render/supplyDrops.ts`, `client/src/render/console/statFlash.ts`, `client/src/sim/supplyChart.ts` and their tests. Heavily edited: `shared/src/constants.ts`, `server/src/game/world.ts`, `server/src/rooms/schema/ArenaState.ts`, `server/src/game/botPort.ts`, `client/src/main.ts`, `client/src/config.ts`.

## Deferred

See `deferred-work.md` (2026-11-19, Story 12.4): the 10 px +XP chart icon smudge; the remaining room streams still derived from `priv`; minute-crate / wreck placement ignoring supply crates; a reconnect flashing stats that rose while disconnected.

## Follow-up 2026-11-20 (cycle 245, 0.20.3, PV 112 unchanged, epic-12 amendment 9)

The supply-drop map mark loses its centre +XP icon (Eric: players must not read it as a collectible; "The circle itself is enough."). `client/src/render/supplyDrops.ts` pools one ring per slot; `CLIENT_CONFIG.supplyDrops.iconPx` removed; `supplyChart.test.ts` updated; DESIGN.md row amended. Client-only.

Same cycle (245), 2026-11-20, epic-12 amendment 10, PV 112 → 113: crates and wrecks are seen by the hull rule (hull reach, haze, rain/smoke, island LOS on the crate centre; `crateKindSight` retired) and drawn above the fog on `dropChart` with the hull fade; the frame's `drops` list is sent only when it changes (absent = unchanged; full list or `[]` otherwise; keyframe on reset/reconnect; ~25× fewer crate bytes); bots forget a remembered crate only on a clear island line. tickCost seed 7, 16 hulls, 90 s: mean ~5.5 → ~7.9 ms/tick, p99 ~11 → ~22 (accepted by Eric).
