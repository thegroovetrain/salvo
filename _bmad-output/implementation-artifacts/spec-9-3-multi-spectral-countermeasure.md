---
title: 'Story 9.3: Multi-Spectral Countermeasure'
type: 'feature'
created: '2026-10-11'
status: 'done'
final_revision: 'PR #266 open (2026-10-12); code head 9d6dfbbc'
baseline_revision: 'e0cd6f6e'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-18-smoke-screen-as-a-sight-occluder.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** SMOKE SCREEN lays a 5 s trail of ten stationary discs that block sight only, with a special in-smoke 1/8-sight rule and a radar arm that paints through it; CHAFF (fake radar echoes) is already gone (9.2). Eric (2026-10-11): *"Smoke and Chaff is being merged into one consumable: A Multi-Spectral Countermeasure. Instead of leaving a smoke trail, it should puff out in a wide region at first and grow. Rather than being a translucent circle, i want the smoke effect to be done with pixels. Rather than doing the random ship-like returns, those pixels will actually directly interfere with both vision and radar, until they fully dissipate."*

**Approach:** Replace `smokeScreen` with one consumable line `countermeasure` (MULTI-SPECTRAL COUNTERMEASURE, key `3`, cap 5). One press = ONE stationary cloud centered on the hull. The cloud is 300 pixels, a pure seeded function of `(id, now − t0)` in `shared/src/sim/cloud.ts`, derived identically on both sides from the wire `{id,x,y,t0}`. A living pixel's 6 u footprint blocks any SIGHT line that crosses it, for every observer including the owner; for everyone EXCEPT the owner it also drops a RADAR return on a target standing inside the cloud when a pixel lies on the path. Pixels die at their own times (6–15 s) and the cloud scales outward 200 → 500 u, so the decay IS the fade. The in-smoke 1/8 rule, `inSmoke`, the lay window and the disc renderer retire. Cycle 174, `0.18.39`, `PROTOCOL_VERSION` 75 → 76.

## Boundaries & Constraints

**Always:**
- **Rulings of record — Eric 2026-10-11 at this spec step (AskUserQuestion; to be recorded as epic-9 amendments 40–47):** (40) **The owner is blind by eye inside their own cloud, radar only** — pixels block the owner's sight too; the in-smoke 1/8 rule (`inSmokeSightFraction`, `stampInSmoke`, `ShipRecord.inSmoke`, self-private `OwnShip.inSmoke`, `effectiveSight`'s third argument, every client `setInSmoke` mirror) is DELETED. (41) **Radar hides only what is INSIDE the cloud, no shadow beyond it:** a non-owner's radar return on point `p` is dropped iff `p` lies inside the cloud's current outline (the envelope circle) AND the segment observer→`p` crosses a living pixel; a ship behind the cloud still paints; the owner's radar ignores the pixels entirely. (42) **The cloud is delivered to whoever's radar range reaches its centre** (the burning-zone gate): owner always, spectator always, otherwise centre within `radarRange` (660 u) AND island-only `losClear` to the outline's nearest rim point. (43) **Numbers as accepted:** life 15 s; 300 pixels; born inside r 200 u; the outline reaches 500 u at end of life; each pixel's death time uniform in 6–15 s; footprint radius 6 u. (44) **Pixels scale outward keeping their bearing:** a pixel born at offset `v` (|v| ≤ 200) sits at `v × s(age)` with `s = 1 + (r1/r0 − 1) × min(1, age/lifeMs)`; the centre stays dense, the rim rides out; the outline radius is `r0 × s(age)`. (45) **Card copy draft accepted:** name MULTI-SPECTRAL COUNTERMEASURE; rows `LASTS 15 S` / `CLOUD 200 → 500 U` (read from CONFIG); hover *"One cloud, centered on you. Its pixels block eyes and enemy radar until they thin out; your own radar sees through it."* (46) **A new cloud every press** — five copies can stack five clouds; nothing restarts or refuses while a cloud lives. (47) Visuals: the card glyph and a cloud time-lapse rendered from the shared pixel function are shown to Eric (artifact) BEFORE the client wave commits (epic AC + the show-visual-proposals rule); the on-water look is his to veto on staging.
- **CONFIG** (`shared/src/constants.ts`): NEW `CONFIG.countermeasure = { lifeMs: 15000, pixels: 300, r0: 200, r1: 500, dieMinMs: 6000, dieMaxMs: 15000, footprintU: 6 }` replaces `CONFIG.smokeScreen` (deleted whole, `inSmokeSightFraction` included). `CONFIG.smoke` (WOUNDED smoke, 250 ms) is untouched and never conflated. Harness `--set` family regex: `countermeasure.*` in, `smokeScreen.*` out.
- **Shared pixel math (`shared/src/sim/cloud.ts`, pure, zero I/O, NO transcendentals — rejection-sample the unit disc with `mulberry32` so both engines are bit-identical):** `cloudSeed(id: string): number` (`hashSeedText` or FNV over the id); `cloudBase(id)` → `{ ox: Float64Array, oy: Float64Array, dieAt: Float64Array }` (300 offsets inside r0, death ages in [dieMinMs, dieMaxMs)) — a memo of a pure function, cached per cloud id on BOTH sides; `cloudScale(age)`; `cloudOutlineRadius(age)`; `forEachLivingPixel(base, cx, cy, age, fn)` yields `(x, y)` of every pixel with `age < dieAt[i]`; `cloudBlocks(a, b, cloud, base, now)`: bounding-circle pre-test (`segCircleHit(a, b, centre, outline + footprintU)`) THEN per living pixel `segCircleHit(a, b, pixel, footprintU) !== null`; `pointInCloud(p, cloud, now)` = inside the outline. Shapes `CloudRecord { id, ownerId, x, y, bornAt, until }` (server store, ids `cl${n}`) and wire `CloudView { id, x, y, t0 }` (KEY ORDER load-bearing; no owner, radius, count or `until`). Both sides call these; never re-derive per side.
- **THE two predicates (`server/src/game/signals.ts`):** `sightClear(me, b, islands, clouds, now)` = `losClear ∧ ¬∃cloud: cloudBlocks(me.state, b, cloud)` — ownership-blind, no in-smoke branch; stays at every sight-tier site (contact row, `pointSighted`, `pointDetected`, `shipSees`, mines, decoys, ballistics, the `mz`/`sm` halos, `hornBandFor`, `wakeGate`'s in-bubble clause, the event rows). NEW `radarClear(me, p, clouds, now)` = `¬∃cloud: cloud.ownerId !== me.id ∧ pointInCloud(p, cloud) ∧ cloudBlocks(me.state, p, cloud)`; it joins `blipGate` as a fourth term (so the ship-blip row, `decoyRadarBlips` and the radar half of `wakeGate` all carry it) — `smokedInBubble` (amendment 147) STAYS: the owner's radar paints a hull inside its own cloud inside its bubble; a non-owner's fails `radarClear`. `ownZoneCovers` = `lit ∧ ¬cloudBlocks` (the `inSmoke` early return deleted; amendment 142 stands: the flare never crosses a cloud, an island never blocks a flare). `sightOf(me, now)` = `effectiveSight(stats, dazzled)` — two arguments again. The bots' line-of-fire check and the flare-reach rule stay island-only.
- **Store & step (`server/src/game/world.ts`):** `world.clouds: Map<string, CloudRecord>` (+ cached base per id) replaces `world.smoke`; `ActivationContext.setCountermeasure()` creates ONE cloud at the hull centre `{ bornAt: now, until: now + lifeMs }` (finite-position guard kept); `stepClouds` replaces `stepSmoke` in the same `STEP_ORDER` seat (expiry sweep only — no lay window, no stamp); `smokeUntil` / `nextPuffAt` / `inSmoke` / `clearSmokeScreen` deleted with their reset sites; `resetForMatchStart` clears the store; `cloudCount` → `/metrics` `cloudLivePeak` (rename of `smokeLivePeak`). Consumable row `equipment/consumables/countermeasure.ts` (`blocked` unless afloat; else `setCountermeasure()`); registry rows renamed.
- **Perception & wire:** registry pseudo-row `cloud` with gate (42); `PerceptionView.clouds`, `FrameMsg.clouds?: CloudView[]` (omitted when empty) replaces `FrameMsg.smoke`; `SignalContextBase.clouds`. The SIX exceptions are untouched; the `cloud` row is a contact-like pseudo-row with its own oracle arm (the 8.18 precedent). `OwnShip.inSmoke` deleted → PV 76.
- **Client:** `render/countermeasure.ts` (class `Countermeasure`, `smoke` chart layer — fog-immune, below `blip` so radar returns are never beneath the cloud, amendment 224(b)) draws every living pixel of the shared function as a square of side `2 × footprintU` in `colors.woundedSmoke` at `CLIENT_CONFIG.countermeasure.fillAlpha`, each pixel easing out over its own last `fadeMs` (client feel knobs); no disc, no rim. `state.net.clouds`, `roomBindings`, `main.ts`; the `setInSmoke` chain (`radar`, `projectiles`, `fog`, `fogHoleRadiusU`'s third arg) deleted; `render/wake.ts` sight mirror `cloudCrossed` via the shared `cloudBlocks` over `state.net.clouds` (ownership-blind, sight half only — the radar half never had a smoke term on the client). Glyph in `equipmentIcons.ts` (Eric-approved candidate); `boonCopy.ts` name/rows/hover per (45). How-to-Play copy (`how-to-play/copy.ts`) and Settings UNTOUCHED (amendment 36; 9.11).
- **Bots:** `countermeasureTactic` = afloat ∧ posture `disengage` ∧ no own cloud alive (`now < cloudUntil`), the 8.20 pool scorer unchanged; `BotTickEntry.smokeUntil` → `cloudUntil`; profile favorites renamed. Drone drops derive from the catalog (nothing to add).
- **Tests assert contracts:** perception oracle gains an independent cloud arm — it MAY call the shared `cloudBase`/`forEachLivingPixel` (the one generator both sides run) but applies its OWN segment test with the literal footprint 6 u, its own inside-outline rule and its own owner rule; non-vacuity ledgers `CLOUD_SIGHT_OCCLUDED`, `CLOUD_RADAR_OCCLUDED` (non-owner, inside), `OWNER_RADAR_THROUGH` (owner paints a hull in own cloud), `CLOUD_FADE_PASS` (a line through a ≥ 13 s cloud passes), `verifyClouds` for the channel; fuzz seeds 0–4 clouds at random ages 0–15 s, including clouds on observers and targets. `shared/src/__tests__/cloud.test.ts`: determinism (same id → identical pixels; two ids differ), every offset inside r0, outline monotone r0 → r1, death ages in range, pixel count decays to 0 at lifeMs, no transcendental in the source (the `noise.test` pattern). Perf pin: 20 observers × 20 hulls × 5 live clouds straddling the lines, `observe()` for all twenty under 50 ms best of 5. No ring/geometry/copy pins, no vocabulary pins.
- `PROTOCOL_VERSION` 76 (`inSmoke` field gone, `smoke` → `clouds` channel, catalog content). `VERSION` / root `package.json` / lockfile `0.18.39`. `CHANGELOG.md` entry. Both trackers stamped one line each. `epics.md` 9.3 dated stamp; `DESIGN.md` smoke row dated stamp only if a line becomes false. Complexity ≤ 10; American spelling; no `Math.random` in sim; `applyDamage` untouched.

**Block If:**
- Any seventh perception exception seems needed, or the invariant suite cannot stay green without widening it.
- A design gap outside rulings 40–47 and the epic AC (a new sound, a new in-game string beyond (45), a radar-shadow reading) — HALT and ask Eric; never invent.
- The perf pin fails at 300 pixels — ask Eric before lowering any number (a per-tick pair memo in `SignalContext` is the first engineering lever; CONFIG is his).

**Never:**
- A trail, a lay window, a re-press restart, a refuse-while-live, fake radar returns, an owner radar term, a radar shadow beyond the cloud, a sight floor inside the cloud.
- Touch `CONFIG.smoke` / `render/smoke.ts` (wounded smoke), How-to-Play, Settings, `CLAUDE.md`, the mock, gun/mine numbers, FLASH SHELLS (9.4).
- Send pixels, counts, radius, owner or `until` on the wire.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Press | key `3`, 1 copy, afloat at (0,0) | copy spent; one `CloudRecord` at (0,0), `bornAt=now`, `until=now+15000`; no further clouds | — |
| Re-press | pressed again at +3 s | second copy spent; a second full cloud at the hull's new position; both live independently | — |
| Sinking press | hull sinking | `blocked` denial, copy kept; clouds already made live out their 15 s | denial event |
| Pixel determinism | id `cl7`, age 4000 on both sides | identical pixel positions and living set (bit-identical, integer RNG + disc rejection) | — |
| Outline growth | age 0 / 7500 / 15000 | outline 200 / 350 / 500 u; a pixel born at offset 100 sits at 100 / 175 / 250 u | — |
| Decay | age 5999 / 10000 / 15000 | 300 living / ~167 / 0 | — |
| Sight occlusion | enemy 150 u away, fresh cloud centered between | enemy NOT a contact for either side; owner equally blind | — |
| Owner inside own cloud | owner at the centre, enemy 100 u away at age 1 s | no contact (pixels on the line); enemy paints as a BLIP for the owner when swept (owner radar through, `smokedInBubble`) | — |
| Non-owner radar, target inside | enemy's beam sweeps the owner standing in the fresh cloud at 400 u | no blip (inside outline ∧ pixel on path) | — |
| Non-owner radar, target behind | target 100 u past the cloud's far rim | blip paints (not inside the outline) — no shadow | — |
| Fade | same geometry at age 14 s | most lines pass: contact/blip returns as the living set thins | — |
| Flare + cloud | observer's lit zone covers an enemy; a cloud lies between | not revealed (amendment 142); island between never blocks the flare | — |
| Torpedo water | in-bubble wake segment crossing pixels | `wk` not emitted; radar-half wake inside a non-owner's cloud dropped by `radarClear`; beyond the cloud unchanged | — |
| Decoy / mine inside a cloud | detect rung behind pixels | not sent by sight; non-owner radar does not paint the decoy inside | — |
| Delivery | cloud centre at 650 u, island-clear rim | in `clouds`; at 670 u not; behind an island (rim and centre) not; owner always; spectator always | — |
| Wire shape | any cloud sent | `{id,x,y,t0}` only | — |
| Zero stock | key `3` with 0 copies | red flash on the square, nothing sent (9.2 grammar) | — |
| Bot | bot with a copy enters `disengage`, no own cloud alive | presses once; not again until `cloudUntil` passes | — |
| Perf | 20 observers × 20 hulls × 5 straddling clouds | `observe()` ×20 under 50 ms (best of 5) | — |
| Reset | match boundary | `world.clouds` empty | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts:1827-1872` -- `CONFIG.smokeScreen` + doc block → `CONFIG.countermeasure` (doc: rulings 40–46); `droneDrops` comment if it names smoke
- `shared/src/sim/smoke.ts` -- DELETE; NEW `shared/src/sim/cloud.ts` (`cloudSeed`, `cloudBase`, `cloudScale`, `cloudOutlineRadius`, `forEachLivingPixel`, `cloudBlocks`, `pointInCloud`, `CloudRecord`, `CloudView` re-export); `shared/src/math/rng.ts:17` `mulberry32`; `shared/src/sim/seedText.ts:27` `hashSeedText`
- `shared/src/sim/sight.ts:49-53` -- `effectiveSight(stats, dazzled)` two-arg; smoke doc block removed
- `shared/src/sim/catalog.ts:156,574` -- line id `countermeasure`, header counts; `sim/effects.ts:59-67` `CONSUMABLE_IDS`; `sim/loadout.ts:167,292-300` `CONSUMABLE_IS_WEAPON.countermeasure=false`, `CONSUMABLE_KEY_ORDER[2]='countermeasure'`
- `shared/src/types.ts:549-564,1434-1459,1532-1534` -- `OwnShip.inSmoke` deleted; `SmokeView` → `CloudView`; `FrameMsg.clouds?`; `shared/src/index.ts:818` PV 76 + history line + barrel exports
- `server/src/game/signals.ts:146-154,243-340,452-466,520-580,880-917,962,1005-1009,1251,2172,2237` -- `SignalContextBase.clouds`; `puffCrossed`→`cloudCrossed` (over `cloudBlocks`); `sightClear` one branch; NEW `radarClear`; `blipGate` fourth term; `ownZoneCovers`; `cloudSignal` gate (42) + `materialize`; registry key `cloud`; header doctrine re-cut
- `server/src/game/perception.ts:62-66,89,120,296-306,450,463` -- `clouds` view/scan/contexts; `server/src/game/frames.ts:145-155,243-248` -- `inSmoke` branch deleted, `clouds` optional channel
- `server/src/game/world.ts:820-900,1190,1382,1847,1969,2067,2174-2175,2333,2380-2381,2392,2461-2490,3288-3304,3583-3595,5798-5801,6154-6224,6320-6321` -- store, record fields, activation, step row, resets, counters
- `server/src/game/equipment/consumables/smokeScreen.ts` -- DELETE → `countermeasure.ts`; `equipment/consumables.ts:34,55`, `equipment/index.ts:145-154` (`setCountermeasure`)
- `server/src/game/drones.ts:262-269,314,487` -- `shipSees(..., world.cloudRecords, now)`; `server/src/metrics.ts:72,133,220`, `server/src/rooms/ArenaRoom.ts:1263` -- `cloudLivePeak`
- `server/src/game/ai/consumables.ts:109-142,189,206`, `ai/types.ts:158-164,405-410`, `ai/botDriver.ts:324`, `ai/profiles.ts:178,306` -- tactic + entry + favorites
- `server/scripts/batchsim/*` -- `--set` family regex (`countermeasure.*`)
- `client/src/render/smokeScreen.ts` -- DELETE → `render/countermeasure.ts`; `client/src/config.ts:2349-2370` `CLIENT_CONFIG.countermeasure { fillAlpha, fadeMs }`; `client/src/state.ts:37`; `net/roomBindings.ts:787-794`; `main.ts:67,278,2896,4012,4044-4063,4374,4628` (construct, render, `inSmoke` chain deleted)
- `client/src/render/radar.ts:410,492,517,1162-1216`, `render/projectiles.ts:299-315,509,829`, `render/fog.ts:50,159` -- `setInSmoke` deleted; `render/wake.ts:63-67,594-597,621,728` -- `cloudCrossed` mirror
- `client/src/render/equipmentIcons.ts:357-370,410` -- glyph; `client/src/ui/boonCopy.ts:123,973-996` -- name, rows, hover
- Tests: shared `__tests__/{smoke→cloud,sight,barrel,boons,draw,catalog,hullRepair,loadout,radarRaster,stats}.test.ts`; server `__tests__/{smokeScreen→countermeasure,smokePerf→cloudPerf,perception,signals,goldenFrames,botTactics,botPolicy,metrics,upgrades,colyseus018,equipment,droneDrops,foghorn,frames,stepOrder,denials}.test.ts`, `scripts/batchsim/__tests__/gunFirstSpend.test.ts`; client `__tests__/{smokeScreen→countermeasure,roomBindings,projectiles,smoke,hotbar,fog,cardStatRows,radarEcho,boonCopy,slotTooltip,ordnanceMasksAreServerOnly,weaponArc,refitFailOpen,refitTooltipFit,frameOrdering,foghorn,keyboard}.test.ts`
- Docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-9-context-amendments.md,epic-9-context.md,deferred-work.md}`, `_bmad-output/planning-artifacts/epics.md` (9.3 stamp), `DESIGN.md` (dated stamp only if false)

## Tasks & Acceptance

**Execution (wave 1 — shared, one agent, Opus):**
- [x] `shared/src/sim/cloud.ts`, `constants.ts`, `sight.ts`, `catalog.ts`, `effects.ts`, `loadout.ts`, `types.ts`, `index.ts` -- the pixel function, CONFIG, ids, wire shapes, PV 76 -- the one source both sides run
- [x] `shared/src/__tests__/*` -- `cloud.test.ts` (determinism, bounds, decay, no transcendentals), re-bases; `npm test -w shared`, `npm run build -w shared`

**Visual gate (orchestrator, after wave 1, before the client wave commits):**
- [x] Artifact: three card-glyph candidates + a cloud time-lapse (0 / 5 / 10 / 13 / 15 s) rendered from the built shared function; Eric's pick via AskUserQuestion (ruling 47)

**Execution (wave 2 — server Fable and client Opus in parallel, shared frozen):**
- [x] `server/src/game/{signals,perception,frames,world,drones}.ts`, `equipment/*`, `ai/*`, `metrics.ts`, `rooms/ArenaRoom.ts`, batchsim regex -- predicates, gate, store, step, bots -- six exceptions untouched
- [x] `server/src/__tests__/*` -- oracle arm + ledgers + fuzz, `countermeasure.test.ts` (every matrix row), `cloudPerf.test.ts`, goldenFrames re-recorded ONLY if the diff is the retired field (note it here); `npm test -w server`
- [x] `client/src/render/countermeasure.ts`, `config.ts`, `state.ts`, `net/roomBindings.ts`, `main.ts`, `render/{radar,projectiles,fog,wake,equipmentIcons}.ts`, `ui/boonCopy.ts` -- pixel renderer, mirrors, glyph, copy
- [x] `client/src/__tests__/*` -- renderer contract (one square per living pixel, none for dead, layer), wake mirror, copy rows from CONFIG, bindings; `npm test -w client`

**Execution (wave 3 — record, Sonnet):**
- [x] `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `epics.md`, both trackers, amendments 40–47 (+ implementer readings) in BOTH homes, `deferred-work.md` (review defers only), `DESIGN.md` if false -- 0.18.39 / cycle 174 / PV 76
- [x] `npm run check` green; results recorded under Verification

**Acceptance Criteria:**
- Given any seeded world in the perception fuzz, when `observe()` runs for every observer, then no contact, mine, decoy, ballistic, mark, blip or wake that the independent cloud oracle hides reaches a client, every delivered cloud passes gate (42), all four non-vacuity ledgers are positive, and the exception count is six.
- Given two hulls with a fresh cloud between them, when either sweeps the other, then neither is a contact; the non-owner gets no blip on a target inside the outline and a blip on a target beyond it; the owner gets a blip on a target inside its own cloud.
- Given the same world at age 14 s, then at least some lines through the cloud pass (the fade is the decay).
- Given `npm run check`, then lint (complexity ≤ 10), tsc ×3, every test and the hook test pass; `PROTOCOL_VERSION` is 76; `CONSUMABLE_IDS` has `countermeasure` and no `smokeScreen`; `CONFIG.smoke.puffIntervalMs` is still 250.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass (Blind Hunter + Edge Case Hunter on Fable, Codex gpt-5.6-sol cross-check on the same diff e0cd6f6e..3ba8c277)
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 1, low 2)
- defer: 3: (high 0, medium 0, low 3)
- reject: 7: (high 0, medium 0, low 7)
- addressed_findings:
  - `[high]` `[patch]` Codex + Edge Case Hunter (both CONFIRMED, same geometry): a mature cloud (outline up to 500 u) centred 660–830 u away pushed pixels inside the observer's 330 u sight bubble but was never delivered under ruling 42 ("radar range reaches the centre"), so the player was blinded with nothing drawn and the client wake mirror disagreed with the server → taken to Eric (a gap in his ruling, never deferred); Eric 2026-10-12: *"If I can see smoke particles in my sight range, I want them composited. It doesn't matter where the 'center of the ring' or the 'edge' is."* and *"If its detected by my radar, I want my radar to paint it."* → amendment 51: delivery is per pixel by the two sensors (sighted pixel with island LOS, or radar-detected pixel: range ∧ swept this tick ∧ shadow march), centre/rim clause deleted; the client HOLDS every received cloud until its life ends (radar delivery is per-sweep); oracle mirrors both clauses, two new ledgers (delivered by sight pixel alone 320, by radar pixel alone 140), directed channel cases rewritten; perf with the march in play 4.8–5.0 ms worst case (dazzled observers, flat and ridge rasters) against the 50 ms tick.
  - `[medium]` `[patch]` Edge Case Hunter (CONFIRMED): `--tune countermeasure.r0=0` passed the harness floor and made `cloudScale` NaN/Infinity so every cloud blocked the whole board while the report looked normal → `r0`, `lifeMs`, `pixels` join the floor-1 leaves; test refuses 0 / 0.5, accepts 1.
  - `[low]` `[patch]` Orchestrator, on the retention the amendment-51 patch introduced: a cloud held from the practice phase could ghost up to 15 s into the match after the server's `resetForMatchStart` cleared its store → the held set moved to `state.net.heldClouds` and the match-start edge in `main.ts` clears it with the renderer (`Countermeasure.clear()`).
  - `[low]` `[patch]` Patch agent + orchestrator: three comments that now lied (the `CloudView` wire doc's centre/rim gate, the client memo header's per-frame pruning, the wake-sources note) re-cut; the name pins in `roomBindings.test` re-based to `MULTI-SPECTRAL CM` (amendment 48).
- deferred (ledger, pre-existing or watch items): the client renderer rebuilds one Graphics per cloud per frame (≤ 300 fills × 5 clouds; Blind Hunter PLAUSIBLE, unmeasured — a dev build is never a perf verdict; staging watch); the perf pin measures static hulls only, no wake ribbons / shells / mines in the (detect, sight] band (Blind Hunter PLAUSIBLE); sequential public ids (`cl${n}`, never reset) disclose the match's running press count — the mines / puffs precedent, project-wide (Codex CONFIRMED, Blind Hunter low).
- rejected: the stale SMOKE SCREEN / CHAFF How-to-Play rows (Codex CONFIRMED — Eric's freeze, amendments 36 and 49); "blind by eye inside the cloud" has no HUD tell (Blind Hunter — the no-unasked-copy rule; Eric's ruling 40 read literally); any enemy cloud is a free radar hide for third parties and the owner's radar alone sees intruders (Blind Hunter CONFIRMED — ruling 41 by construction, reported to Eric); a respawned same-session owner keeps the owner carve-out on a previous life's cloud for ≤ 15 s (Edge Case Hunter PLAUSIBLE — recorded as reading 50(k)); an observer standing within 6 u of a living pixel is blocked in every direction (Edge Case Hunter — ruling 40 read literally); the oracle reads production's `forEachLivingPixel` for pixel positions (Blind Hunter — the shared generator is the agreed oracle input; only the gate is re-derived); `World.cloudRecords` allocating per call (nit).
- agreement picture: Codex and the Edge Case Hunter independently found the delivery gap (CONFIRMED both, fixed by Eric's re-ruling); the Edge Case Hunter alone found the harness floor (confirmed by the orchestrator against `cloudScale`, fixed); the Blind Hunter returned BUILD-ON-IT with no code defect and three ruling consequences for Eric's eye; Codex's other two findings were a project-wide id convention and Eric's own copy freeze.

## Design Notes

- **Why pixels are a memo, not state:** `cloudBase(id)` is a pure function of the id; both sides cache it per cloud (server store record, client renderer map) so the per-tick cost is one scale multiply per pixel, never a re-roll. Nothing but `{id,x,y,t0}` crosses the wire, so the chokepoint is unchanged.
- **Why the disc is rejection-sampled:** no `sin`/`cos` → bit-identical offsets on every JS engine (the map-gen posture, cheaper than trig); uniform in the disc by construction.
- **Why radar is "inside + path" and not a shadow (ruling 41):** convexity makes it one test — a disc is convex, so when `p` is inside the outline the segment's intersection with the disc is one interval ending at `p`; testing the whole segment against that cloud's pixels equals testing the inside part. A target outside the outline is never tested, which is exactly "no shadow beyond".
- **Fade arithmetic (told to Eric):** 300 pixels of r 6 u; a line across a fresh cloud crosses ~9 footprints; at 13 s (≈ 67 living, outline 460 u) ≈ 4 in 10 lines pass; at 14 s ≈ 6 in 10.

## Verification

**Commands:**
- `npm run build -w shared` -- expected: clean (before server/client tests)
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: all green
- `npm run lint` -- expected: zero errors (complexity ≤ 10)
- `npm run check` -- expected: green; counts recorded in CHANGELOG -- RESULT 2026-10-11: green — shared 41 files / 1040 tests, server 89 / 2478 (after the review-gate patches; 2474 before), client 124 files green, lint 0 errors (2 pre-existing max-lines warnings), hook test green
- `grep -rn "smokeScreen\|inSmoke\|SmokePuff\|SmokeView\|puffRadius\|puffCrossed\|smokeUntil\|nextPuffAt" shared/src server/src client/src --include=*.ts | grep -v __tests__` -- expected: no hits outside `how-to-play/copy.ts` (Eric's freeze, amendment 36) and dated doc comments

**Manual checks:**
- Eric picks the glyph and judges the time-lapse on the artifact before the client wave commits; the live cloud is judged on staging after the PR.

## Auto Run Result

Status: done — PR #266 open to `development` (never merged by the agent; Eric judges the cloud on staging).

**Implemented:** SMOKE SCREEN replaced by the MULTI-SPECTRAL COUNTERMEASURE on key `3` (cap 5): one press = one stationary cloud of 300 seeded pixels (`shared/src/sim/cloud.ts`, rejection-sampled disc from `mulberry32`, no transcendentals, bit-identical on both sides from the wire `{id,x,y,t0}`), outline 200 → 500 u over 15 s with per-pixel deaths at 6–15 s and a 6 u blocking footprint. Pixels block SIGHT for every observer including the owner (the in-smoke 1/8 rule, `inSmoke`, the lay window and the disc renderer are gone); enemy RADAR loses only targets inside the cloud's outline with a pixel on the beam's path, no shadow beyond, the owner's radar ignoring pixels (`radarClear`, the blip gate's fourth term, shared by ship blips, decoy paints and the wake's radar half); the cloud is DELIVERED when any living pixel is sighted or radar-detected (Eric's re-ruling at the review gate, amendment 51), and the client holds a received cloud until it dies, clearing at the match-start edge. Client draws 20 u wounded-smoke-grey squares that fade as each pixel dies (glyph A, card name MULTI-SPECTRAL CM). Bots press once per disengage. `PROTOCOL_VERSION` 76; version 0.18.39 (cycle 174); epic-9 amendments 40–51.

**Files:** shared `sim/cloud.ts` (new), `constants.ts`, `sight.ts`, `catalog.ts`, `effects.ts`, `loadout.ts`, `types.ts`, `index.ts` (+ `sim/smoke.ts` deleted); server `game/{signals,perception,frames,world,drones}.ts`, `equipment/{index,consumables}.ts` + `consumables/countermeasure.ts` (smokeScreen.ts deleted), `ai/{consumables,types,botDriver,profiles,tactics}.ts`, `metrics.ts`, `rooms/ArenaRoom.ts`, `scripts/batchsim/overrides.ts`; client `render/{countermeasure,cloudBases}.ts` (new; `render/smokeScreen.ts` deleted), `render/{radar,projectiles,fog,wake,equipmentIcons,stage,fire}.ts`, `net/roomBindings.ts`, `state.ts`, `main.ts`, `config.ts`, `ui/boonCopy.ts`; tests re-based in all three workspaces with new `cloud.test.ts`, `countermeasure.test.ts` (server and client), `cloudPerf.test.ts`; records (`VERSION`, `package.json` + lock, `CHANGELOG.md`, both trackers, `epics.md`, `DESIGN.md`, amendments 40–51 in both homes, `deferred-work.md`).

**Review:** Blind Hunter (Fable) build-on-it, no code defect; Edge Case Hunter (Fable) build-on-it with two items; Codex gpt-5.6-sol fix-first. Patches 4 (the delivery gap → Eric's re-ruling, amendment 51; the harness floor; the practice → match ghost; stale comments + name pins); deferred 3 (renderer per-frame rebuild, perf-pin scope, sequential public ids — all ledgered); rejected 7 (Eric's copy freeze, ruling consequences reported to him, readings recorded as 50(k)).

**Follow-up review recommended:** true — the amendment-51 patch re-cut the delivery gate (a perception row) and introduced client-side retention of a channel; both are anti-cheat/parity surfaces that a fresh pass should read.

**Verification:** `npm run check` green three times across the run (final: shared 1040, server 2478, client 124 files / 3900 tests, lint 0 errors with 2 pre-existing max-lines warnings, hook test green). Perf pin 1.5–2.0 ms (4.8–5.0 ms with the radar march forced) against the 50 ms tick. goldenFrames unchanged. No dev server booted; no smokes run (none in scope).

**Residual risks / for Eric:** (1) the on-water look (20 u squares, fade 2 s, alpha .55) and the held-until-death chart behavior are judged on staging; (2) any enemy cloud is a free radar hide for third parties and only the owner's radar sees intruders (ruling 41 by construction); (3) a press is disclosed to anyone whose radar beam crosses a pixel within 660 u, with the hull's exact position as the cloud centre (ruling 51 by construction); (4) nothing on the HUD says why sight is blank inside a cloud (the no-unasked-copy rule); (5) How-to-Play still describes SMOKE SCREEN and CHAFF until 9.11.

