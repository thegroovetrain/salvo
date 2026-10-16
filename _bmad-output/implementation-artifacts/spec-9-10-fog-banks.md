---
title: 'Story 9.10: Fog Banks'
type: 'feature'
created: '2026-10-15'
status: 'in-progress'
baseline_revision: 'b2df9308'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-9-armor-piercing.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The ocean has no weather a captain can hide in. Eric wants rolling fog banks (epic-9 amendments 149–150): a haze that eats EYESIGHT only, so sailing into one is a hide/engage/disengage tool and costs the watch for mines and torpedoes, while radar is exactly what it would be without the fog. Story 5.4 was deferred owing a radar re-derivation; Eric's "no radar term, ever" is that re-derivation.

**Approach:** Server world state `World.fogBanks` (centre, full radius, born, until), stepped in a new `stepFog` STEP_ORDER row beside `stepClouds`, driven by a room-private seed (`pseudonymSeed`-derived like the dropout seed) and `world.now`; a coverage controller keeps the banks inside the live ring between 2 % and 8 % of its water. The sight cost is ONE shared pure function (`shared/src/sim/fog.ts`): a ray from observer to point pays `sightCostPerU × density(t)` extra units for every unit of its length inside a bank (segment-disc chord, `Math.sqrt` only). It enters perception through the existing sight predicates in `signals.ts` so every sight-tier gate follows by construction; the 750 u flash/smoke halo pays the same cost; radar, zone circles, foghorn and storm never see it. A new contact-like `fog` channel ships `{id,x,y,r,d}` rows to any client whose 750 u halo reaches the bank with island LOS — Eric's SEVENTH declared exception. The client draws them as a lighter-grey haze on their own chart layer under hulls.

## Boundaries & Constraints

**Always:**
- Eric's rulings of 2026-10-15 (AskUserQuestion, this spec step) are the contract; record them as epic-9 amendments 162–168 in BOTH homes (`epic-9-context-amendments.md` and the `## Ratified Amendments` section of `epic-9-context.md`), implementer readings as 169:
  - **162 — DELIVERY AT THE 750 u HALO IS THE SEVENTH DECLARED EXCEPTION.** A fog bank is sent to a client when its disc's nearest point is within the observer's `radarRange × muzzleFlashFactor` (the `sm`/`mz` rung, 750 u at base) on an island-clear segment to that nearest rim point (the `sm` rule byte-for-byte); spectators always. The bank's own delivery pays NO fog cost. The declared exceptions are now SEVEN: `sp`, `hc`, `mz`, `sunk`, `sm`, `fh`, `fog`. (Rejected: the 500 u sight bubble with no new exception.) The CLAUDE.md "exactly SIX" line is stale by this ruling — report it, never edit it.
  - **163 — DARK TO BOTH.** Radar paints only beyond the GEOMETRIC sight radius as today (`inRadarAnnulus`, `wakeInnerBound` unchanged); a hull inside 500 u that fog hides from the eye is invisible to radar too. Nothing in `dropout.ts`, `radarShadow`, the blip/wake/decoy radar gates or the cloud's radar half changes. (Rejected: the annulus starting at the fogged reach.)
  - **164 — `CONFIG.fog.sightCostPerU = 2`.** Fog water counts triple: a sailor fully inside a mature bank sees 500 / 3 ≈ 167 u; a 170 u-deep edge swallows the whole bubble. (Rejected: 1, 3.)
  - **165 — BANK DIALS AS PROPOSED, RADIUS AND DENSITY RAMP TOGETHER.** `CONFIG.fog = { sightCostPerU: 2, radiusMinU: 150, radiusMaxU: 400, lifeMs: 120000, growMs: 30000, fadeMs: 30000, coverageMin: 0.02, coverageMax: 0.08, targetPeriodMs: 120000, maxBanks: 12, spawnCheckMs: 1000, spawnTries: 16 }`. Scale `s(t)` = linear 0 → 1 over `growMs` from birth, 1 through the hold, linear 1 → 0 over the last `fadeMs` before `until`; radius `= R × s`, density `= s` (a young or dying bank is small AND thin). Coverage target redrawn every `targetPeriodMs` uniformly in [coverageMin, coverageMax]; a bank spawns at each `spawnCheckMs` check while full-size coverage (Σ π R² of banks whose centre is inside the live ring ÷ ring water area) < target and live count < `maxBanks`; a bank is never killed to meet the band. A bank whose centre falls outside the live ring starts fading at once (its `until` is moved to `now + fadeMs × s(now)` so the line continues without a jump). (Rejected: density flat with radius ramping; density holding until the last 30 s.)
  - **166 — SPAWN ON WATER, HULLS IGNORED.** Up to `spawnTries` rejection samples uniform in the live ring's bounding square (no trig), accepted when inside the ring disc and `pointInIsland` is false for every island; captains and bots are ignored (a bank may form on you); no sample accepted → no spawn this check. (Rejected: clear of captains; anywhere including land.)
  - **167 — FLASH AND SMOKE PAY; ZONE CIRCLES DO NOT.** The `mz` and `sm` rows compare `d + fogCost` against `muzzleFlashReach`; lit / burn / foul zone circles keep `zoneCircleVisible` (radar range, amendment 63) and never see fog — the story AC's "zone VISIBILITY follows" clause is corrected by this ruling. The foghorn and the storm ignore fog (ruled in 149). (Rejected: sight ray only; all three.)
  - **168 — PvE DRONES ARE FOGGED BY THE SAME RULE.** `shipSees` gains the fog inputs and `drones.ts` threads them, so target acquisition, the aggro witness test and the shot test lose what fog hides; the shot-from chase (amendment 139) is untouched. (Rejected: drones ignore fog.)
- Layering: the pure math (`shared/src/sim/fog.ts`: `FogBankRecord`, `fogScale`, `fogRadius`, `fogDensity`, `segDiscChord`, `fogCostAlong`) is deterministic, zero I/O, `Math.sqrt` only (no transcendentals — add the file to the `FORBIDDEN_MATH` guard pattern in a shared test); the spawn controller and store live in `server/src/game/world.ts` (server-only state; never on the schema; the client holds nothing — it draws the rows it is sent and fades a row that stops arriving).
- Perception: the fog cost enters through the EXISTING sight sites in `signals.ts` — `contactSignal` (inline test), `pointSighted`, `pointDetected`, `shipSees`, `discSighted` (to the nearest rim point), the `mz`/`sm` halo tests, and `wakeGate`'s in-sight torpedo-water clause — each comparing `d + fogCostAlong(me.state, p, ctx.fogBanks, ctx.now, CONFIG.fog)` against its range, computed ONLY after the plain range test passes (fog never widens anything, so a point beyond geometric range is rejected before the chord math). `ownZoneCovers` (a flare lights from above) is unchanged. `SignalContext` gains `fogBanks: readonly FogBankRecord[]` (fogged AND spectator contexts; a spectator ignores it).
- Anti-cheat: everything spatial still leaves through `frames.ts` from `observe()`; the `fog` row materializes `{id, x, y, r, d}` and nothing else (key order is msgpack-load-bearing; `r` = current radius, `d` = density 0..1 rounded to 3 decimals, no full `R`, no `until`, no born time). `optionalChannels` key order: litZones, burnZones, foulZones, decoys, clouds, fog. `PROTOCOL_VERSION` 84 → 85 with a history line.
- Invariant tests (`server/src/__tests__/perception.test.ts`): the oracle re-derives the fog cost INDEPENDENTLY — numeric integration (sample the segment at ≤ 1 u steps, count samples inside each bank's current radius × density × cost), never the shared closed form; `sighted` / `detected` / the `mz` / `sm` verifiers / `cloudGateOracle`'s sight half all add the oracle cost; a `verifyFog` channel verifier (spectator, or nearest rim within `radarRange × muzzleFlashFactor` with `sightClearOracle` to the rim point) with shape checks (exactly `id,x,y,r,d`); `CONTACT_LIKE` + `'fog'`, registry 27 keys, header rewritten to SEVEN exceptions citing amendment 162; the fuzz seeds banks (random R, age, some straddling observer–hull pairs, some on the observer) via a test seam on the World; non-vacuity ledgers: a hull at 300 u hidden by a mature bank between them, the same pair seen with the bank gone, a hull inside a thin young bank seen, a mine inside a bank undetected at 300 u, an `sm` pulse at 600 u hidden by a bank, a radar blip at 700 u painted identically with and without a bank on the ray, a `fog` row delivered at 700 u and withheld at 760 u (nearest rim).
- Determinism and clocks: `fogRng = mulberry32(((opts.pseudonymSeed ?? (seed ^ 0x1b873593)) ^ <fresh unused constant>) >>> 0)` (room-private entropy, not the wire map seed — a client cannot predict banks beyond its halo); all timing from `world.now`; the controller runs only while the zone timeline has started (`zoneStartT !== null`, the match live) so bare test worlds and the practice water see no banks unless a test asks; `resetForMatchStart` clears the store like clouds.
- Bots: fogged only through the bound `observe` thunk (ai/ never imports world); the direct `stats.sightRange` filters in `tacticKit` / `equipment` / `sweepMiss` operate on already-fogged contacts and stay as they are. No bot tactic seeks fog this story (Story 9.13 reads this one).
- Client: a new `fog` chart layer in `CHART_LAYER_ORDER` directly after `litZone` and before `smoke` (under every hull and nameplate — the server already withheld what the eye cannot see, so a delivered hull inside a bank must stay visible; the own hull, radar paints and the countermeasure haze all sit above as today); each row is a soft disc, radius `r`, alpha `d × CLIENT_CONFIG.fogBank.maxAlpha`, feathered rim, color token `colors.fogBank` (lighter than `countermeasureSmoke` 0xc4c0b8); a row that stops arriving fades out over `CLIENT_CONFIG.fogBank.fadeOutMs`; the fog-of-war hole stays `effectiveSight` (the haze tells where the eye fails); motion-gated drift only if the rendered page gets a yes; the layer is masked by the existing haze LOS caster (amendment 60) so haze behind an island is not drawn. The LOOK is judged by Eric on a rendered page BEFORE the client commit (amendment 150; memory: show visual proposals first) — three candidates beside a countermeasure cloud and wounded smoke on the real ocean color, with the fog's own primitives.
- Harness: `'fog.'` joins `TUNE_FAMILIES`; floors — `sightCostPerU` ≥ 0, `radiusMinU` / `radiusMaxU` / `growMs` / `fadeMs` / `targetPeriodMs` / `spawnCheckMs` / `maxBanks` / `spawnTries` ≥ 1 (`lifeMs` already ≥ 1), `coverageMin` / `coverageMax` on the unit interval; cross-key: `radiusMinU ≤ radiusMaxU`, `coverageMin ≤ coverageMax`, `growMs + fadeMs ≤ lifeMs`. The harness JSON gains a `fogBanksLivePeak` readout (count only). No run this cycle.
- Perf: a server test in the `machineGunFlashCost.test.ts` pattern — 16 observers, 112 hulls, 12 mature banks, 20 mines — times `observe()` for all 16 best-of-5 under the 50 ms tick, printing under `HC_PERF_LOG=1`; `World.fogBankCount` feeds `/metrics` (count only).
- Records: `VERSION` + `package.json` + lock 0.18.55 → 0.18.56 (cycle 191), `CHANGELOG.md`, `epics.md` 9.10 stamp, BOTH trackers one-line stamps, amendments 162–169 in both homes, `docs/codebase-map.md` fog files, `deferred-work.md` 5.4 entries (the 2026-08-11 significant-discovery entry and the 2026-08-14 deferral record) stamped RESOLVED 2026-10-15 by Story 9.10, and a dated one-line stamp appended under epic-5 amendment 47 ("5.4's owed re-derivation RESOLVED by epic-9 amendments 149–150 / 162–168: no radar term, ever"). No GDD / DESIGN / How-to-Play edits (9.17's).
- Gates: `npm run check` green; ESLint complexity ≤ 10; `goldenFrames` unchanged unless a fixture starts the zone (then every moved channel listed here); commit and push the branch continuously; ONE PR to `development` at the end; NEVER merge.

**Block If:**
- A fixture or smoke proves a bank can be delivered beyond the 750 u halo, or a fogged hull reaches a client on any channel → halt (anti-cheat).
- The perf pin cannot be met on the dev box without changing the rule (e.g. needing a spatial index on banks) → halt and surface the numbers.
- The rendered-page gate gets no pick from Eric → the client commit waits; do not invent the look.
- Any need for an eighth exception, a radar term, in-game copy, or a bot fog tactic → halt (Eric's).

**Never:**
- No radar term of any kind (`dropout`, `radarShadow`, blip/wake/decoy gates, the cloud's radar half, the heat grid) — ruled 149, 163.
- No fog effect on zone circles, the foghorn, the storm, movement, damage or prediction (fog never enters `shared/src/sim` step functions; the predictor is untouched).
- No fog on the Colyseus schema; no bank beyond the halo on the wire; no `R`, `until`, born time or owner on a row.
- No client-side hiding: the client draws what it is sent; it never decides visibility.
- No in-game copy; no How-to-Play entry; no DESIGN.md rewrite (dated stamps are 9.17's).
- No `Math.random` / `Date.now` / transcendentals in `shared/src/sim/fog.ts`; no second derivation of the fog cost anywhere (oracle excepted, by design).
- Do not re-propose decks, missiles, hydrophones, a ready room, or the 500 u delivery (rejected 2026-10-15).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Deep bank between | observer at (0,0), hull at (400,0), mature bank centre (200,0) R 150, cost 2 | chord 300 → cost 600 → 400 + 600 > 500: no contact; no blip (inside geometric sight); hull absent from the frame | No error |
| Thin edge | same hull, bank centre (200,150) R 150 → chord ≈ 0 at y 0 (tangent) | cost 0 → contact delivered | No error |
| Young bank | bank age 7.5 s (s = 0.25): radius 37.5, density 0.25; hull at (400,0), bank at (200,0) | chord 75 × 0.25 × 2 = 37.5 → 437.5 ≤ 500: seen | No error |
| Inside a bank | observer inside mature bank R 300 at its centre, hull at 150 u | chord 150 × 2 = 300 → 450 ≤ 500: seen; hull at 180 u → 540 > 500: hidden | No error |
| Mine in fog | mine at 300 u inside a mature bank (chord ≥ 120) | detect = 1 × sight: 300 + 240 > 500 → mine row absent; the mine still arms/triggers as today | No error |
| Radar unchanged | hull at 700 u, mature bank on the ray | `inRadarAnnulus` true (700 > 500), blip gate identical with and without the bank | No error |
| Smoke pulse | wounded hull at 600 u emitting `sm`; bank chord 100 on the ray | 600 + 200 > 750 → `sm` withheld; bank gone → delivered | No error |
| Zone circle | burn zone centre at 900 u behind a bank | delivered (radar range, no fog term) | No error |
| Fog row delivery | bank R 100 at 800 u (nearest rim 700) with island LOS | row `{id,x,y,r:100,d:1}` present; at 860 u (rim 760) absent; island on the rim segment → absent; spectator → always | No error |
| Fog row shape | any delivered bank | exactly keys id,x,y,r,d in that order; `d` ∈ [0,1] | No error |
| Storm kill | bank centre leaves the live ring at s = 1 | `until` := now + fadeMs; radius/density ramp to 0 over 30 s; removed at `until` | No error |
| Storm kill mid-fade | bank already fading (s = 0.4) when its centre leaves the ring | `until` := min(until, now + fadeMs × 0.4) — no jump, no extension | No error |
| Controller band | ring water area A; live banks full-size area F; target T drawn in [0.02, 0.08] | spawn one per check while F/A < T and count < 12; never despawn to meet T | No error |
| Spawn rejection | 16 samples all on land or outside the disc | no spawn this check; next check tries again | No error |
| Pre-start world | `zoneStartT === null` | no bank ever spawns; `resetForMatchStart` clears any store | No error |
| Degenerate dials | `sightCostPerU` 0 via `--tune` | fog costs nothing; rows still delivered (a visual only) | Harness floors refuse negatives; `lifeMs` ≥ 1; `growMs + fadeMs > lifeMs` refused with a TunableError |
| Non-finite | a bank record with NaN radius (bug guard) | `fogCostAlong` treats the bank as absent (chord 0); `fogScale` clamps to [0,1] | No throw |
| Perf | 16 observers × 112 hulls × 12 banks × 20 mines | `observe()` for all 16 best-of-5 < 50 ms (printed under `HC_PERF_LOG=1`) | Test fails if over budget |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- new `CONFIG.fog` block (amendments 164–165), doc cites 149–150 / 162–168
- `shared/src/sim/fog.ts` (NEW) -- `FogBankRecord {id,x,y,R,bornAt,until}`, `fogScale(bank, now, cfg)`, `fogRadius`, `fogDensity`, `segDiscChord(a,b,c,r)`, `fogCostAlong(a,b,banks,now,cfg)`; sqrt only; header states the no-transcendentals rule
- `shared/src/types.ts` -- `FogBankView {id,x,y,r,d}`; `FrameMsg.fog?: FogBankView[]`
- `shared/src/index.ts` -- barrel exports; `PROTOCOL_VERSION` 85 + history line
- `shared/src/__tests__/fog.test.ts` (NEW) -- chord geometry (miss / tangent / through / endpoint inside / both inside / degenerate), scale ramps at the four boundaries, cost additivity over two banks, NaN guards; `noise.test.ts`'s `FORBIDDEN_MATH` pattern applied to `fog.ts`
- `shared/src/__tests__/{barrel,wire/protocol pins}` -- re-bases
- `server/src/game/world.ts` -- `fogBanks: Map<string, FogBankRecord>`, `fogRng`, `fogTarget`, `fogNextTargetAt`, `fogNextCheckAt`, `fogSeq`, `waterShare` (1 − `landCoverage(map)` once), `stepFog()` (storm-kill → expire → controller), `spawnFogBank()`, `fogBankRecords` / `fogBankCount` getters, `STEP_ORDER` row `stepFog` after `stepClouds`, `resetForMatchStart` clear, test seam `seedFogBank(record)` (test-only, documented)
- `server/src/game/perception.ts` -- `fogBanks` threaded into both contexts; header's exception list
- `server/src/game/signals.ts` -- `fogCostTo(ctx, me, p)` helper; the seven sight sites take the cost; `shipSees(me, other, islands, fogBanks, now)`; `fogSignal` row (`fog` key, materialize `{id,x,y,r,d}`); `SIGNAL_REGISTRY` + `PSEUDO_ROWS`; the SIX → SEVEN comment block (925–931)
- `server/src/game/frames.ts` -- `fog` in `optionalChannels`
- `server/src/game/drones.ts` -- `shipSees` calls thread `world.fogBankRecords` / `world.now`
- `server/src/metrics.ts`, `server/src/rooms/ArenaRoom.ts` -- `fogBanksLivePeak` beside `cloudLivePeak`
- `server/scripts/batchsim/overrides.ts` -- `'fog.'` family, floors, cross-key validator; `report` gains the peak readout
- `server/src/__tests__/perception.test.ts` -- oracle integration cost, verifiers, fuzz seeding, ledgers, header, registry 27
- `server/src/__tests__/{stepOrder,fogBanks (NEW: controller band, storm kill, spawn-on-water, determinism from seed, pre-start inert), fogPerf (NEW), drones/droneSightScope (fogged drone), radarWire/ordnanceMasksAreServerOnly/colyseus018/denials (PV 85), goldenFrames}.test.ts`
- `client/src/render/stage.ts` -- `fog` chart layer after `litZone`
- `client/src/render/fogBanks.ts` (NEW) -- `FogBanks` view: sync rows, soft discs, fade-out, LOS mask reuse (`hazeLos.ts`)
- `client/src/net/roomBindings.ts` -- `deps.fogBanks.sync(f.fog ?? [])`
- `client/src/config.ts` -- `CLIENT_CONFIG.fogBank { maxAlpha, featherFrac, fadeOutMs, ... }`, `colors.fogBank`
- `client/src/__tests__/{stageOrder/fogBanks (NEW), ...}` -- layer seat, sync/fade contract
- Records: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/codebase-map.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-9-context-amendments.md,epic-9-context.md,epic-5-context-amendments.md,deferred-work.md}`, `_bmad-output/planning-artifacts/epics.md` (9.10 stamp)

## Tasks & Acceptance

**Execution (wave 1 — shared, one agent, Opus):**
- [ ] `shared/src/constants.ts`, `sim/fog.ts`, `types.ts`, `index.ts` -- `CONFIG.fog`, the pure math, the wire row, PV 85 -- the one derivation both sides and the oracle's counterpart depend on
- [ ] `shared/src/__tests__/fog.test.ts` + re-bases -- the matrix's geometry rows; `npm test -w shared`, `npm run build -w shared`

**Execution (wave 2a — server world/drones/harness, one agent, Opus; after wave 1):**
- [ ] `server/src/game/world.ts`, `metrics.ts`, `rooms/ArenaRoom.ts`, `scripts/batchsim/overrides.ts` (+ report) -- store, `stepFog`, controller, spawn, getters, seam, STEP_ORDER, match-start clear, harness family (drones.ts is wave 2b's: the `shipSees` signature lives in signals.ts)
- [ ] `server/src/__tests__/{fogBanks,stepOrder}.test.ts` -- controller band, storm kill, spawn-on-water, same seed same banks, pre-start inert

**Execution (wave 2b — perception chokepoint, one agent, Fable; after 2a, shared frozen):**
- [ ] `server/src/game/{signals,perception,frames,drones}.ts` -- `fogCostTo`, the seven sight sites, `fogSignal`, registry, contexts, channel, comment blocks (SEVEN exceptions); `shipSees(me, other, islands, fogBanks, now)` and the three drone call sites
- [ ] `server/src/__tests__/{perception,fogPerf,droneSightScope,radarWire,ordnanceMasksAreServerOnly,colyseus018,denials,goldenFrames}.test.ts` -- oracle, verifiers, fuzz seeding, the matrix's ledgers, perf pin, drone blinded, PV pins

**Rendered-page gate (orchestrator, in parallel with waves 1–2):**
- [ ] three haze candidates beside a countermeasure cloud and wounded smoke on the real ocean color, at a 500 u sight framing; Eric picks (AskUserQuestion) → amendment 169 look clause

**Execution (wave 3 — client, one agent, Opus; after wave 1 and the page pick):**
- [ ] `client/src/render/{stage,fogBanks}.ts`, `net/roomBindings.ts`, `config.ts`, tests -- layer, view, sync, fade-out, LOS mask reuse, knobs, token

**Review gate (orchestrator):** Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol` on the same diff; seeds: (1) a sight site that still compares the plain distance (grep every `sightOf(` and `muzzleFlashReach(` caller); (2) the oracle's integration vs the closed form disagreeing at a tangent or an endpoint inside the disc; (3) the storm-kill `until` rewrite extending a life; (4) the controller spawning past `maxBanks` or inside land through a stale ring; (5) `fog` rows leaking `R`/`until`; (6) `shipSees` callers that forgot the fog args.

**Execution (wave 4 — record, Sonnet):**
- [ ] `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/codebase-map.md`, `epics.md` stamp, both trackers, amendments 162–169 in BOTH homes, deferred-work 5.4 stamps, epic-5 amendment 47 stamp -- 0.18.56 / cycle 191 / PV 85
- [ ] `npm run check` green; branch pushed; ONE PR to `development`, never merged

**Acceptance Criteria:**
- Given a mature bank between an observer and a hull inside 500 u whose chord × 2 pushes the fogged distance past sight, when the frame is built, then the hull is on no channel of that frame; with the bank removed it is a contact.
- Given any observer and any radar-tier subject, when a bank is placed anywhere, then the blip / decoy / wake / cloud-radar / zone-circle outputs are byte-identical with and without the bank.
- Given a bank whose nearest rim is within 750 u with island LOS, when the frame is built, then exactly `{id,x,y,r,d}` is delivered; beyond 750 u or behind an island, nothing; spectators always.
- Given the invariant fuzz with fog seeded, when it runs, then every frame passes the SEVEN-exception oracle and every non-vacuity ledger above is non-empty.
- Given a live zone, when the controller runs for ten minutes under the default dials, then full-size coverage inside the live ring never exceeds `coverageMax` by more than one bank's area, banks spawn only on water, and the same seed yields the same bank sequence.
- Given a PvE drone and a target hidden by fog, when the drone ticks, then it does not acquire or fire at the target; shot-from aggro still turns it.
- Given the client receives fog rows, when drawn, then they sit under hulls and nameplates on the `fog` layer, in the look Eric picked, and a row that stops arriving fades out.
- Given `npm run check`, then green; the perf pin under 50 ms; PV 85; both trackers stamped.

## Spec Change Log

### 2026-10-15 (later) — Eric: no discs; the field re-plan
- Eric, after the disc build cleared review: *"You know what, no. I don't want discs because it wont look like realistic rolling fog."* and *"figure out how to make it performant. you got this."* The intent contract's disc clauses are superseded by the `## Re-plan 2026-10-15 — THE FIELD` section below; the eye rulings (163, 164, 167–170) and the look (B) stand. KEEP: `withinSight` and the toll's entry through every sight predicate; `SightField`; the drone threading; the client `fog` layer seat; the oracle's numeric integration; the perf pattern. The disc-era review patches that still apply (NaN-safe `withinSight`; `sweepMiss` fog-is-not-evidence) are re-specified in the field waves; the client restamp/fade patches are moot.

### 2026-10-15 — spec-step corrections against the story text (Eric's rulings 162–168, this spec step)
- The story AC's "the VISIBILITY of burn / foul / lit zones follows" could not hold: zone circles are delivered by radar range (`zoneCircleVisible`, amendment 63). Eric: zones untouched (167).
- The story's "overlap its sight bubble" / "distance it would see smoke or fire" conflict: Eric chose the 750 u halo as a SEVENTH declared exception (162); the AC's "keep SIX" clause is superseded.
- PvE drones do not use `observe()`; Eric: fogged through `shipSees` (168).
- The cached `epic-9-context.md` was read as valid although `epics.md` has a later mtime: the only later change is the one-line 9.9 BUILT stamp committed with the context (b9174918).
- The main checkout carried one dirty, unrelated file (`_bmad-output/party-mode/memories/installed/.memlog.md`, another session's party-mode log); work proceeds in a fresh worktree from `development` and that file never rides along.

## Review Triage Log

## Design Notes

- **Why the cost is added to distance, not subtracted from range:** one comparison shape at every site (`d + cost ≤ range`), so the detect factor and the 750 u halo reuse it unchanged, and the oracle can mirror it numerically.
- **Why rows carry `r` and `d` each frame rather than `t0`/`R`:** a bank's life can be cut short by the storm, so a derived radius would need `until` on the wire; sending the two current numbers keeps the client stateless and discloses less.
- **Chord of segment AB through disc (C, r):** project C onto AB, clamp the two circle-line intersection parameters to [0, 1], chord = max(0, t2 − t1) × |AB|; `Math.sqrt` only.
- **Storm kill without a jump:** with `s(now)` the current scale, setting `until = now + fadeMs × s` makes the existing fade formula `(until − now) / fadeMs` evaluate to `s` at this instant and fall linearly to 0.
- **Cost of the fuzz seam:** `seedFogBank` is the only writer besides the controller and is test-only (documented as such; production never calls it).

## Verification

**Commands:**
- `npm test -w shared` -- expected: green incl. `fog.test.ts`
- `npm test -w server` -- expected: green incl. the invariant fuzz with fog, `fogBanks`, `fogPerf` (< 50 ms best-of-5)
- `npm test -w client` -- expected: green
- `npm run check` -- expected: green (lint complexity ≤ 10, tsc ×3, all tests, hook test)

**Manual checks:**
- Eric on staging: banks visible as the picked haze inside the 750 u halo; a hull sailing into a bank disappears from the eye and does not paint on radar inside 500 u; a mine inside a bank is spotted late; radar beyond 500 u unchanged; zones and foghorn unchanged.

## Re-plan 2026-10-15 — THE FIELD (supersedes every disc clause above; Eric: "no discs")

Eric 2026-10-15, after the disc build passed review: *"You know what, no. I don't want discs because it wont look like realistic rolling fog."* then *"figure out how to make it performant. you got this."* The rulings that are about the EYE stand unchanged (163 dark to both, 164 cost 2, 167 flash + smoke pay / zones never, 168 drones fogged, 169 a fogged plot is not a miss, 170 drone avoidance unfogged, 171(b) haze under hulls, the look B "wisps"). The rulings that were about DISCS are superseded by this section (165 bank dials, 166 spawn placement) and amendment 162's per-observer `fog` row is MOOT (nothing per-observer about fog rides the wire any more — the exceptions are SIX again). Everything below is an orchestrator reading Eric may veto on staging; the 2–8 % band (amendment 150) is kept as the coverage target.

**The model.** Fog is a continuous DENSITY FIELD `fogDensityAt(x, y, t) ∈ [0, 1]` over the whole ocean, derived on BOTH sides from one `fogSeed` (uint32, on the welcome message), the match clock `t = world.now` and `CONFIG.fog`, with the island generator's transcendental-free gradient noise (`sim/noise.ts` `makeLayer` / `fbm`): `n(x, y, t) = fbm((x − wx·t)/λ, (y − wy·t)/λ, layerA, oct, gain)` blended with a second layer `layerB` by a triangle wave of `t / morphMs` (so banks drift with a wind AND change shape), mapped to density by a soft step `density = clamp01((n − cut) / edgeBand)` — a thin edge is thin, the heart of a bank is 1. `cut` is the COVERAGE threshold: the server re-estimates it every `refreshMs` as the (1 − target) quantile of `n` over a fixed sample lattice inside the live ring (so the fogged share of the ring's area IS the target, at every ring size, with no bank count), slews it at most `cutRatePerS`, and publishes it on the Colyseus schema as `fogCut` (one float, match-wide weather like the zone rings — not per-ship, not spatial). The target itself wanders in [coverageMin, coverageMax] every `targetPeriodMs` (amendment 165's controller, kept). Before the zone timeline starts `fogCut = +∞` (density 0 everywhere; the practice water has no fog) and it slews in from the first live refresh.

**The toll (unchanged contract, new integrand).** `fogTollAlong(a, b) = Σ density(midpoint_i) × step × sightCostPerU` by a fixed-step midpoint march (`marchStepU` 10 u, the last step partial). `withinSight` is exactly as built (plain squared range test first, then `d + toll ≤ range`; NaN-safe `!(d2 ≤ r²)`). **Performance (Eric: make it performant):** (1) the server keeps a COARSE QUICK-REJECT RASTER — `rasterCellU` (100 u) cells over the live ring's bounding square, rebuilt once per `refreshMs` (≈10k cells × `oct` noise evaluations ≈ 2 ms once a second, or sliced across ticks), each cell holding the max of its centre + 4 corner densities; a ray whose cells (a DDA walk) all read 0 pays no toll and skips the march — at 2–8 % coverage that is most rays; (2) the march runs only on rays that already passed the plain range test; (3) a ray's toll is at most `ceil(len / step)` samples (≤ 75 for the 750 u halo), each one `fbm` of `oct` (3) octaves ≈ 60 ns; (4) the quantile uses a fixed 48×48 lattice (2,304 samples) once per second; (5) the client refreshes its haze bitmap every `CLIENT_CONFIG.fogField.refreshMs` (250 ms) at `cellU` 18 u over the halo square (≈ 7k samples per refresh, nothing per frame but a sprite move). Budget pin: `observe()` for 16 captains among 112 hulls + 20 mines at 8 % coverage best-of-5 < 50 ms (the fogPerf pattern), and the raster + quantile refresh < 5 ms.

**`CONFIG.fog` (every leaf a `--tune fog.*` dial):** `sightCostPerU 2` (164) · `coverageMin 0.02` · `coverageMax 0.08` · `targetPeriodMs 120000` · `wavelengthU 600` (base feature size — banks a few hundred u across) · `octaves 3` · `gain 0.5` · `windU 12` (u/s drift; the wind DIRECTION is a unit vector drawn from the seed without trig — a point rejection-sampled in the unit square until inside the unit disc, normalised with `Math.sqrt`) · `morphMs 90000` · `edgeBand 0.12` · `cutRatePerS 0.02` (noise units/s) · `refreshMs 1000` · `rasterCellU 100` · `marchStepU 10` · `quantileLattice 48`. Floors: every length/time/count ≥ 1, `sightCostPerU` ≥ 0, `gain` on (0, 1], the coverage pair on [0, 1], `coverageMin ≤ coverageMax`.

**Wire.** `WelcomeMsg.fogSeed` (uint32); schema `ArenaState.fogCut` (float32; the server writes it on change only; `+∞` is sent as the sentinel `fogCut = 9` — a noise value no fbm reaches — so the schema never carries Infinity); `CONFIG.fog` already rides the welcome `config`. The `fog` frame channel, `FogBankView`, `FrameMsg.fog`, the `fogSignal` row, `verifyFog`, `PSEUDO_ROWS`/registry `fog` and the SEVENTH exception are REMOVED before they ever ship — the invariant header, the cloud-row block and `CLAUDE.md`'s "exactly SIX" are true again. `PROTOCOL_VERSION` stays 85 (history line re-worded: the client reads `fogSeed`, `fogCut` and `CONFIG.fog`). Disclosure, recorded: a modified client can evaluate the field anywhere (where fog is, never where hulls are) — fog placement is weather; accepted.

**Server.** `world.ts`: `fogField` (built from `fogSeed = (seed ^ 0x3c6ef372) >>> 0` — the client-known map seed is fine, the field is public weather), `fogCut`, `fogTarget`, the refresh clock, the quick-reject raster, `fogTollAlong(ax, ay, bx, by)` and `fogDensityAt(x, y)` methods, the `stepFog` row (after `stepClouds`: refresh raster + quantile when due, slew the cut; nothing else), `resetForMatchStart` resets cut to none and the clocks; the bank store, `seedFogBank`, `clearFogBanks`, `fogBankRecords`, `fogBankCount` are DELETED; metrics `fogLivePeak` → `fogCut` + the estimated coverage (numbers, never positions). `ArenaRoom`: `fogSeed` on the welcome, `fogCut` synced in `syncZoneGeometry`'s style. Perception: `SightField.fog` is a `(ax, ay, bx, by) => number` toll thunk bound to the world (the context threads `world.fogTollAlong`), nothing else changes in `signals.ts` except deleting the `fog` row. Bots: `botEntries` gain `fogAt: (x, y) => world.fogDensityAt(x, y)`; `sweepMiss`: a plot with `fogAt(plot) ≥ 0.5` is not a miss (amendment 169 on the field). Drones: unchanged (`SightField`). Harness: the `fog.` family, floors, cross-key.

**Client.** `render/fogField.ts` replaces `render/fogBanks.ts`: builds the shared field from `welcome.fogSeed`, eases the schema `fogCut` over `refreshMs`, refreshes a density bitmap (cell 18 u, halo square, `serverNow()`) every 250 ms into one linear-filtered sprite on the `fog` chart layer (kept where it is — under every hull), drawn through Eric's wisps: the density texture MULTIPLIED by a pre-baked tiling puff texture (seeded once; the pale greys of pick B) that scrolls with the wind, alpha `density × maxAlpha` (0.6); between refreshes the sprite translates by the wind; the amendment-60 halo + island LOS mask reused (the fog is visible by eye only inside the 750 u halo and never behind an island); spectators unmasked; motion off → no scroll. `roomBindings`: no fog sync (the `fog` frame key is gone); the match-start edge resets the eased cut. Tests: determinism (same seed/t/cut → same density), the bitmap refresh cadence, the eased cut, the layer seat, no per-frame allocation.

**Tests.** Shared: `fogDensityAt` ∈ [0,1], finite everywhere, identical for identical inputs, 0 for the no-fog cut, 1 at a point far above the cut; `fogTollAlong` ≥ 0, additive over subsegments within one step's tolerance, 0 with the no-fog cut; `fogCutForTarget` (pure: `(field, t, points, target)`) returns a cut whose realized share over the same points is within 1 lattice cell of the target; the FORBIDDEN_MATH guard. Server: the perception fuzz's oracle integrates the SHARED density at 1 u steps using the world's cut (the field is the world, like islands; the oracle never calls `withinSight`/`fogTollAlong`), the quick-reject raster is proved conservative (a seeded sweep: no ray with toll > 0 is ever rejected), the ledgers re-derived on the field (hidden contact, thin edge seen, hidden mine/fish, hidden `sm`, radar through fog; the two fog-row ledgers are gone), the twelve directed cases re-cut on a field fixture (a test seam `world.setFogCutForTest(cut)` pins the cut so the geometry is exact: a very low cut → density 1 everywhere, the no-fog cut → 0), the coverage controller lands within ±1 point of its target after one refresh and never slews faster than `cutRatePerS`, pre-start has no fog, determinism from the seed, drones + bot-memory cases, `fogPerf` at 8 % coverage. Golden frames: unchanged (no scenario starts the zone).

**Records (re-cut).** VERSION / package 0.18.56, PV 85, cycle 191 stand; CHANGELOG re-worded for the field; amendments: 162 stamped MOOT (no per-observer fog row; exceptions SIX), 165–166 SUPERSEDED, 171 rewritten, new 172 (Eric: no discs — a fractal noise field; performant is the agent's), 173 (field readings); `docs/codebase-map.md` rows for `fogField.ts`; trackers one-line.
