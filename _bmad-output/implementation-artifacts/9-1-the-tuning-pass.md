# Story 9.1: The Tuning Pass (Eric steers)

Status: in-progress (session 1 built 2026-10-07, cycle 169 — Eric tests on development; ring 2 is his next dial)

<!-- Created 2026-10-06 by gds-create-story; revised the same day on Eric's correction. THE DIALS ARE WHATEVER ERIC DECIDES THEY ARE — the ones mapped below are the ones he named on 2026-10-06, written up so the facts are to hand; they are not the list, and nothing limits him to them. Every number is his, asked through AskUserQuestion, never filled in by an agent. Eric's next step is HIS OWN session with the balance harness (/balance-sim, `server/scripts/batchSim.mjs`), not a dev-story run; dev work starts when he says so. Epic 9 rulings live in epic-9-context-amendments.md (append-only). -->

## Story

As Eric,
I want one story dedicated to time-to-kill and to escaping combat, where I turn the dials live against the staging build,
so that a fight lasts long enough to be a fight and breaking off is a real option.

**Eric's brief (2026-10-06, verbatim):** *"I have my own ideas for some fixes. We simply want to have a story dedicated towards adjusting this, and I will steer it there. Hull HP is one metric to tweak, but I also want to play with the size of the map, the proportion of islands and landmasses, and perhaps even switching from one ring of 20 spawns around the outside, to one outer ring of 12 and one inner ring of 8, just to mix things up."*

On escape, his diagnosis (one of four offered): **too few escape tools**. The first new tool is Story 9.2 (SPEED BOOST consumable), not this story. This story does not invent an escape mechanic.

## Acceptance Criteria

1. **Every dial Eric decides to turn is reachable as a single source of truth.** The dials are whatever he says they are, in this story and as it runs. The ones he named on 2026-10-06, given the shipped 0.18.33 game, are `CONFIG` values or map-generation parameters: the three hulls' `hp` (`CONFIG.shipClasses.{torpedoBoat,mineLayer,battleship}.hp`), the map radius (`CONFIG.map.baseRadius`), the island coverage band (`TERRAIN_PARAMS.coverTarget/coverMin/coverMax` in `shared/src/sim/heightField.ts`), and the spawn layout (today one ring of `playerCap` = 20 candidates at `CONFIG.map.spawnFraction` of the radius). The two-ring layout (outer 12, inner 8) is built ONLY if Eric rules it in, with its radii his numbers.
2. **Every ruling is recorded.** Every value Eric changes is appended to `_bmad-output/implementation-artifacts/epic-9-context-amendments.md` as his ruling with the date and his words; `[DRAFT]` marks anything he has not yet ruled, and nothing `[DRAFT]` ships as settled.
3. **Map generation stays deterministic.** Zero transcendentals on the generation path (`map.ts`, `islandShape.ts`, `heightField.ts`, `noise.ts`), byte-identical across JS engines; any spawn-layout change passes the navigability and coastline-clearance guards in `sim/map.ts` and is covered by the existing property tests (extended, not weakened).
4. **Guns are not touched off sim evidence.** Any gun change is Eric's math, stated as such in the amendment. The batch sim measures attrition and class share only; quick runs are capped at 99 matches and are never launched unprompted.
5. **Wire, version, trackers, How-to-Play.** `PROTOCOL_VERSION` bumps only where the client reads a changed block (see Dev Notes: in practice every one of these four dials is client-read); both trackers (`_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/sprint-status.yaml`) get one-line stamps; How-to-Play's derived stat tables follow `effectiveStats()` with no hand edit.

## Tasks / Subtasks

- [ ] **Task 0 — Eric's harness session, then the sitting (AC: 1, 2).** Eric runs his own session with the balance harness first (`HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs`, `--set` / `--sweep` / `--tune` per `server/scripts/batchsim/args.ts`; a dial the harness cannot reach — spawn layout, island cover, a faithful radius preview — is a harness gap to report to him, see §What NOT to do). Dev work begins only when he says so. Then, before touching code, put HIS dials (whatever he has decided they are — the list below is what he named, not a limit) to him via AskUserQuestion, one dial per question, with the current value and the blast radius (Dev Notes §Dial map) stated plainly. Record each answer verbatim in `epic-9-context-amendments.md` as the next numbered amendment (the file is at #1; this story's rulings start at #2). Dials named so far: (a) hull hp per class; (b) `baseRadius`; (c) island cover band; (d) spawn layout — keep one ring of 20, or outer 12 + inner 8, and if two rings, both radii; (e) anything else he brings from the harness session; (f) whether any other number moves "in step" (hull repair amounts, ARMOR step, drone hp) — ask, do not assume. A dial he leaves alone is recorded as "unchanged, Eric 2026-10-xx".
  - [ ] Save unasked follow-up questions until the whole set is written; then ask them in one sitting.
- [ ] **Task 1 — Hull hp (AC: 1, 2, 5).** Change only the three `hp` lines in `shared/src/constants.ts` (`:117`, `:132`, `:145`) to Eric's integers. Update every pin that states the old numbers (Dev Notes §Blast radius: hp). Do NOT touch kinematics, hull dims, or gun numbers.
- [ ] **Task 2 — Map radius (AC: 1, 2, 3, 5).** Change `CONFIG.map.baseRadius` (`constants.ts:94`) only if ruled. Re-check the closing-rate band test in `shared/src/__tests__/zone.test.ts:271-300`; if it fails, that is an Eric ruling (re-ratify the band or move `zone.beatMs`), never a test edit to make it pass. Re-base the generation-time guard and raster-size pins (`map.test.ts:526`, `heightField.test.ts:346-357`) to the new radius with the arithmetic shown in the test comment.
- [ ] **Task 3 — Island coverage (AC: 1, 2, 3, 5).** Change `TERRAIN_PARAMS.coverTarget/coverMin/coverMax` (`heightField.ts:160-231`) only if ruled; keep `coverMin ≤ coverTarget ≤ coverMax`. Re-pin `map.test.ts:76-78` and `heightField.test.ts:58-73` to the new band. Run the 100-seed sweep (`map.test.ts`) and confirm every seed still validates (cover band, navigability, zero lagoons, coastline ≥ `SPAWN_MARGIN` from the ring) and the production path never throws across the sweep (`map.test.ts:514`). A seed throw at the new band is a HALT, not a retry-count bump (see memory: the map-gen throw is Eric-deferred).
- [ ] **Task 4 — Spawn layout (AC: 1, 2, 3).** ONLY if Eric rules the two-ring layout in. Promote the layout to `CONFIG.map` (e.g. a `spawnRings` list of `{ fraction, slots }` — the shape is the dev's, the numbers are Eric's), keep `spawnFraction` semantics for the single-ring case or retire it with a dated comment, and extend (never fork) these touch points: `heightField.ts` keep-clear annulus (`makeEvaluator:362-363`, one band per ring), `map.ts` flood seeds (`spawnRingSeed:345-354`, `closeUnreachableWater` seeding via `islandShape.ts seedFromRing:203-208`), `GameMap.spawnRing` (becomes the ring list or keeps the outer ring plus a second field — document the choice), `server/src/game/spawn.ts` (`SPAWN_CANDIDATES:51`, `ringPoint:101-103`, `pickSpawn:258`; lattice = union of both rings, same per-match `spawnPhase`, same greedy max-min), and the property tests (Dev Notes §Blast radius: spawn). Keep `playerCap` 20 = 12 + 8 as an asserted invariant if that is his split.
- [ ] **Task 5 — Derived values follow (AC: 5).** Confirm by reading, not editing: `client/src/how-to-play/weaponTables.ts` ARMOR row and hull rows derive from `effectiveStats()`; `client/src/ui/classSelect.ts` pip fill derives hp through the toughness anchors in `client/src/config.ts:1185` (base 200, step 50) — if a new hp value lands between pips, report it to Eric (pips are his ruling, cycle 39), do not re-anchor. The golden-frame snapshot (`server/src/__tests__/goldenFrames.test.ts:1128`) is re-recorded ONLY after a diff review shows the only channel changes are hp-shaped.
- [ ] **Task 6 — Wire, version, record (AC: 2, 5).** `PROTOCOL_VERSION` 71 → 72 in `shared/src/index.ts:795` with a dated doc block naming which blocks moved (precedent: the PV 36 note for 2400 → 2800). `VERSION` + root `package.json` + `package-lock.json` 0.18.33 → 0.18.34 (cycle 169; fetch origin and re-check both numbers right before the PR — parallel sessions have collided before). `CHANGELOG.md` entry. Dated supersession stamps (never rewrites) in the GDD beside the class table (`gdd.md:118-122`), "The ocean" (`:295`), "Spawning" (`:299`) and the generation-parameters line (`:381`) for whatever moved; `epics.md` Story 9.1 gets a one-line dated stamp. Both trackers, one line each. Spec file `spec-9-1-the-tuning-pass.md` per the Epic 8 pattern.
- [ ] **Task 7 — Gate and the staging loop (AC: 3, 4, 5).** `npm run check` green (fresh worktree: `npm install --include=dev && npm run build -w shared` first). Lint complexity ≤ 10. Commit and push continuously; ONE PR to `development` at the end, never merged by the agent. Eric plays the staging build; a second round of rulings re-enters at Task 0 inside this same story until he calls it.

## Dev Notes

### The two halves of this story

1. **Time-to-kill** — hull hp is the dial Eric named. Context: the hp ladder was last moved at cycle 39 (`spec-ttk-pip-rebalance.md`: 1 pip = 200 hp, +50/pip; TB 250 / ML 300 / BS 350), hull repair amounts were "doubled in step with hull hp" then (`constants.ts:2107-2113`), and the 2026-10-02 deck-gun retune (amendment 232) is the gun side, which is NOT reopened here. Out-of-combat regen is 1 % of missing hull per second after 15 s (amendments 46, 175).
2. **Escape** — Eric's diagnosis is "too few tools"; 9.2 builds the first one. This story's contribution to escape is only what the map dials do (radius, island cover, spawn layout). Do not propose a new escape mechanic.

### Dial map — the dials Eric named on 2026-10-06 (facts to hand; the list is his to change)

| Dial | Where | Today | Client reads it? | Pins that state the number |
|---|---|---|---|---|
| Hull hp | `shared/src/constants.ts:117/132/145` | TB 250 · ML 300 · BS 350 | yes (`effectiveStats`, class select, HUD, How-to-Play) | `shipClasses.test.ts:47/63/79/101-117`; `hullRepair.test.ts:142-166` (max hull 450 = 350 + 4×25; ceiling 362.5 s); `weaponTables.test.ts:66-68` (ARMOR tops DREADNOUGHT at 450); `classSelect.test.ts:56-60` (pips 4/2/4 · 2/4/2 · 3/3/3); `goldenFrames` snapshot |
| Map radius | `shared/src/constants.ts:94` `CONFIG.map.baseRadius` | 2800 u (2400 → 2800, epic-5 amendment 42) | yes (`generateMap`/`mapRadius` on the client; same seed must build the same ocean) | `map.test.ts:122-125, :526` (1500 ms budget, O(r²)); `heightField.test.ts:346-357` (405×405 raster at 2800); `zone.test.ts:271-300` closing-rate band; `TERRAIN_PARAMS.regionWavelength` tracks it at module load (`heightField.ts:196`) |
| Island cover | `shared/src/sim/heightField.ts` `TERRAIN_PARAMS.coverTarget 0.025 / coverMin 0.02 / coverMax 0.03` | 2–3 % land | yes (bundled through `generateMap`) | `map.test.ts:76-78, :203`; `heightField.test.ts:58-73`; `retargetCover` (`map.ts:252-270`) makes ≤ 2 extra passes to land in band |
| Spawn layout | `CONFIG.map.spawnFraction 0.8` + `server/src/game/spawn.ts` (`SPAWN_CANDIDATES = CONFIG.map.playerCap`) | one ring, 20 candidates at 0.8 R, even spacing 700.8 u > radar 660 u | `spawnFraction` indirectly (keep-clear annulus is in the shared field); the client never sees spawn points | `spawn.test.ts` (whole file; `:115-122` out-spaces radar; `:166-224` one lattice per match); `map.test.ts:288-319` coastline ≥ 64 u from the ring; `heightField.test.ts:36, :53` hard-code `R * 0.8` |

**Roster scaling is dormant by ruling.** `mapRadius(cap) = baseRadius × sqrt(cap / capRef)` exists (`constants.ts:2492`) and `capRef = playerCap = 20`, so the ocean is one fixed radius for every roster (epic-6 amendment 11 cancelled roster-scaled oceans; GDD `:295`). Changing `baseRadius` changes every match; do not re-propose scaling.

### Radius — what moves with it

- The storm rings derive from the map radius at runtime (`zone.ts:222-229`: ring 0 = R, geometric steps to the 660 u terminal ring). `zone.test.ts:271-300` pins the old closing-rate band (worst-case escape per close ≈ 1.019 battleship-minutes, asserted in (1.0, 1.05)). **Eric's reading (2026-10-06): a captain has about 4 minutes to reach the next ring even before it is known, and nobody realistically fails to outrun the storm unless they are simply bad; it is testable on the build.** So a larger R failing that pin is a stale-pin problem to bring to him with the measurement, not a design concern to raise against the radius; he may retire or re-base the band, and Story 9.5's rule applies (a test guards a contract, not a geometry).
- Map generation cost is O(r²): the 1500 ms guard and the raster-size pin re-base with arithmetic shown; NFR perf on the client's worst-case scene (`stage/worstCase.ts:813`) is a production smoke, never a Vite dev build verdict.
- Spawn spacing at a full lobby is `2·spawnRing·sin(π/20)` = 700.8 u against 660 u radar; a smaller R breaks `spawn.test.ts:115-122` by design (ask, do not fix).
- `welcome.mapRadius` is sent and checked against the client's own build (`connection.ts:695-703`); PV must bump (precedent PV 36).

### Spawn layout — if the two-ring layout is ruled in

- Single-ring assumptions to extend: the keep-clear annulus (`heightField.ts:362-363`, `ringHalfWidth 150 / ringPenalty 0.9`), the flood/lagoon seeds (`map.ts:345-354`, `islandShape.ts:203-208`), the coastline-clearance test, `GameMap.spawnRing`, `pickSpawn`'s lattice.
- Inner-ring spacing: 8 slots at fraction f give `2·f·R·sin(π/8)`; cross-ring distances are not covered by the existing radar out-spacing pin — write the new pin from Eric's radii, then show him the number.
- Stale comments to correct while there: `spawn.ts:9, :129, :143` cite an `INNER_FRACTION (0.15)` guarantee that does not exist; the real centre clear is `TERRAIN_PARAMS.centerRadius 0.08 / centerFeather 0.1`. The fallback ladder (`fallbackSpawn:137-144`) walks 8 concentric circles to the centre — keep it as the last resort.
- Heading stays `atan2(-y, -x)` (facing centre). PvE fleets place through `pickFleetAnchor` (`spawn.ts:202-236`), untouched.
- Everything spatial still leaves the server through `frames.ts`; a spawn is the existing `sp` exception. No new event, no seventh exception.

### Blast radius: hp

- `effectiveStats()` is the only derivation (`stats.ts:602-613`, `:762-770`); ARMOR adds +25 max hp per tier, 4 tiers, `healOnGrant` (`catalog.ts:413-415`). Never re-derive a boosted stat elsewhere.
- NFR6 ceiling test (`hullRepair.test.ts:124-166`) encodes (max hull + 500 heal + 500 shield) / 4 hp/s; update the arithmetic and the comment, keep the contract (amendment 125).
- `world.ts:4075` divides by `ship.stats.maxHp` unguarded (`overrides.ts:259-261`) — hp must stay ≥ 1 (it will).
- Bots: hull identity is dead (amendment 162); nothing in `server/src/game/ai/` keys on hp literals — verify with a grep before claiming it.
- Hull repair (`hullRepair.instantHp 50 / regenHp 50 / regenMs 5000`) and drone hp (45/60/75) are NOT in scope unless Eric says "in step" at Task 0(f).

### What NOT to do

- No gun numbers from sim evidence (Eric 2026-10-02); no batch-sim run without his yes; ≤ 99 matches if yes. `--tune shipClasses.battleship.hp=…` and `--set map.baseRadius=…` exist in the harness (`overrides.ts:32-33, :55-98`), but `TERRAIN_PARAMS.regionWavelength` is fixed at module load so a `--set` radius is not a faithful preview of a `CONFIG` change — say so if he asks for one.
- No in-game copy; How-to-Play tables derive. `copy.ts:92` hard-codes "15 seconds" for regen — not this story's dial; leave it.
- No `CLAUDE.md` edit. No rewrites in the GDD, only dated stamps. No rewrite of `epic-9-context-amendments.md`, append only.
- Do not resolve the Eric-deferred map-gen throw (rare seed throw at cap kicks a queued group); if a new band makes it reachable in the sweep, HALT and tell him.
- Do not weaken a property test to pass a new number; re-base with arithmetic in the comment or bring the failure to Eric.
- Never merge the PR.

### Project Structure Notes

- `shared/src` stays pure and deterministic; `server/src/game/spawn.ts` may use `Math.sin/cos` (server-only, documented), `shared/src/sim/map.ts` may not (source-scanned by `map.test.ts:588-595`, `heightField.test.ts:360-380`).
- A new `CONFIG` block is read by the client only through `generateMap`/`mapRadius`; promote any new spawn-layout numbers into `CONFIG.map`, never a client-side constant.
- Bots (`server/src/game/ai/`) may not import `world.js` (ESLint).
- ~500 LOC soft cap per file; `heightField.ts` and `map.ts` are already large — extend in place only when cohesive.

### Project Context Rules

- Strict layering; same sim functions both sides at 50 ms dt; `CONFIG` single source of truth; `effectiveStats()` is the boon desync firewall; `PROTOCOL_VERSION` is a runtime join gate; anti-cheat chokepoint `frames.ts` with six exceptions; `world.ts`/`match.ts` have zero Colyseus imports; intent only through `inputs.ts`.
- Tests guard a contract of the thing under test — never vocabulary, copy strings, wall-clock timing, or geometry standing in for a perf claim (project-context Testing Rules, Epic 8 retro). Story 9.5 audits the suite; this story adds no test that would fail that audit.
- Versioning 0.18.X, +1 per landed cycle. Branch from `development`; PR targets `development`; Render deploys staging; manual QA on staging is the gate.
- Eric is the requirement; AskUserQuestion for every ruling, never a questions file; a design gap found at review is a question before the PR, not a ledger entry. American spelling. Plain-words explanations to Eric.

### Previous story intelligence (Epic 8 close → Epic 9 open)

- Epic 8 landed 23/23 at 0.18.33, PV 71, 243 amendments; 7,467 tests + 266 hook tests green at cycle 168. Eric: "this is now the most fun version", and TTK is "still far too short".
- Pattern that worked: Eric authors every number table; `[DRAFT]` cells are his to fill; rulings recorded verbatim at the gate; visual proposals shown first.
- Pattern that bit: seven unruled spec clauses reached code in Epic 8 (retro insight 2) — an unruled clause is marked, never presented as settled. Two sessions collided on cycle/PV/amendment numbers once (2026-10-01) — fetch origin before numbering and again before the PR.
- Review gates: Blind Hunter + Edge Case Hunter + Codex (`-m gpt-5.6-sol`, prompt via stdin) on the diff; findings recorded as a numbered review-gate amendment.

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` §Epic 9, Story 9.1.
- Proposal: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-06.md`.
- Rulings: `_bmad-output/implementation-artifacts/epic-9-context-amendments.md` #1; `epic-8-context-amendments.md` #46, #125, #162, #175, #232, #243; `epic-6-context-amendments.md` (roster-scaled oceans cancelled, fixed 2800 u); `epic-5-context-amendments.md` amendment 42 (2400 → 2800) and 43 (closing-rate band).
- Retro: `_bmad-output/implementation-artifacts/epic-8-retro-2026-10-06.md` §4, §6.
- GDD: `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md` `:77`, `:118-122`, `:295-299`, `:381`.
- Prior tuning specs: `spec-ttk-pip-rebalance.md`, `spec-island-elevation-and-grounding.md`, `spec-fractal-island-generation.md`, `spec-deck-gun-numbers-retune.md`.
- Code: `shared/src/constants.ts` (`map:93-98`, `shipClasses:114-156`, `regen:2155`, `zone:2173`, `mapRadius:2492`); `shared/src/sim/heightField.ts` (`TERRAIN_PARAMS:160-231`, `makeEvaluator:360-363`, `buildField:406`); `shared/src/sim/map.ts` (`generateMap:583-607`, `validateMap:535`, `MAP_RULES:617`); `shared/src/sim/zone.ts:222-229`; `shared/src/sim/stats.ts:602-613, :762-770`; `shared/src/sim/catalog.ts:413-415`; `server/src/game/spawn.ts`; `server/src/game/world.ts:1552-1567, :1802, :2109-2158, :6305`; `server/src/rooms/ArenaRoom.ts:167, :324, :367-376`; `client/src/net/connection.ts:695-703`; `client/src/how-to-play/weaponTables.ts`; `client/src/config.ts:1185`; `shared/src/index.ts:440-446, :795`.

## Dev Agent Record

### Agent Model Used

Claude Fable 5.1 (claude-fable-5-1), session 2026-10-06 → 2026-10-07, driven live by Eric.

### Debug Log References

- `batch-sim-evidence-2026-10-06.md` — the harness session: baseline, 5 single arms, C1, h5600, h6000, w5500, raw death timelines.
- `~/hc-campaigns/tune-2026-10-06/` — campaign JSONs, raw replays, map renders (`maps/`).

### Completion Notes List

- Session 1 ships the board Eric chose to test on development: radius 5500 u, 10 % land, ring ladder 11000 → 7000 → 4000 → 2000 → 0 as literal `CONFIG.zone.ringRadii`. Hull hp, guns, heals, spawn layout untouched.
- Rulings in epic-9 amendments 2–9. Ring sizes are not a test subject (amendment 8).
- Map generation never gives up (amendment 10, same day): an invalid draw reseeds deterministically until a valid ocean comes out.
- Open for Eric after his play: ring 2 (3.8 alive at 8:00 in sim vs 5); the 92-vertex cap on very large islands (map look); storm share 13–17 % of bot deaths with the 4-minute beat; the 1000 u terminal vs 660 u radar reach.

### File List

- shared: `src/constants.ts`, `src/sim/zone.ts`, `src/sim/map.ts`, `src/sim/heightField.ts`, `src/index.ts`; tests `zone`, `map`, `heightField`, `radarShadow`, `collision`, `barrel`, `radarRaster`.
- server: `src/game/spawn.ts`; `scripts/batchsim/{overrides,args,main,runner}.ts`; tests `spawnLayout` (new), `drones`, `botTactics`, `bots`, `doctrines`, `radarWire`, `upgrades`, `perception`, `colyseus018`, `denials`, `goldenFrames` (+ snapshot); `scripts/batchsim/__tests__/{terrainDials (new), batchSim, poolReadouts}.test.ts`.
- client: tests `zone`, `ordnanceMasksAreServerOnly`.
- docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/implementation-artifacts/{epic-9-context-amendments.md, batch-sim-evidence-2026-10-06.md, spec-9-1-the-tuning-pass.md, sprint-status.yaml}`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/planning-artifacts/{epics.md, gdds/.../gdd.md}`.
